"""Optional local object-detection service for Partcheck AI.

Requires custom-trained weights for construction defects. A generic COCO model is
not a reliable detector for missing guardrails, cracks, corrosion, etc.
"""
import base64
import io
import os
import re
from functools import lru_cache
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from PIL import Image, UnidentifiedImageError

app = FastAPI(title="Partcheck AI Detector", version="1.0.0")
MODEL_PATH = os.getenv("PARTCHECK_MODEL_PATH", "/models/partcheck.pt")
DEVICE = os.getenv("PARTCHECK_DEVICE", "cpu")
DEFAULT_CONFIDENCE = float(os.getenv("PARTCHECK_MIN_CONFIDENCE", "0.35"))
MAX_IMAGE_BYTES = int(os.getenv("PARTCHECK_MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))

class DetectRequest(BaseModel):
    image: str = Field(min_length=20)
    confidence: Optional[float] = Field(default=None, ge=0.05, le=0.99)

@lru_cache(maxsize=1)
def get_model():
    if not os.path.isfile(MODEL_PATH):
        return None
    from ultralytics import YOLO
    return YOLO(MODEL_PATH)

def decode_data_url(value: str) -> Image.Image:
    match = re.match(r"^data:image/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)$", value or "")
    if not match:
        raise HTTPException(status_code=400, detail="Image must be a JPEG, PNG or WebP data URL.")
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Image base64 is invalid.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds detector size limit.")
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Image could not be decoded.")
    if image.width < 32 or image.height < 32:
        raise HTTPException(status_code=400, detail="Image is too small to inspect.")
    return image

@app.get("/health")
def health():
    model = get_model()
    return {"ok": True, "model_loaded": model is not None,
            "model": os.path.basename(MODEL_PATH) if model is not None else None,
            "message": "Ready" if model is not None else "Model weights not installed; add a trained Partcheck .pt file."}

@app.post("/detect")
def detect(payload: DetectRequest):
    model = get_model()
    if model is None:
        raise HTTPException(status_code=503, detail="Detector weights are not configured. Train/export a custom Partcheck YOLO model and set PARTCHECK_MODEL_PATH.")
    image = decode_data_url(payload.image)
    threshold = payload.confidence if payload.confidence is not None else DEFAULT_CONFIDENCE
    try:
        result = model.predict(source=image, conf=threshold, device=DEVICE, verbose=False, max_det=100)[0]
        names = result.names or {}
        detections = []
        if result.boxes is not None:
            for item in result.boxes:
                x1, y1, x2, y2 = [float(v) for v in item.xyxy[0].tolist()]
                x1 = max(0.0, min(float(image.width), x1)); x2 = max(0.0, min(float(image.width), x2))
                y1 = max(0.0, min(float(image.height), y1)); y2 = max(0.0, min(float(image.height), y2))
                w, h = x2 - x1, y2 - y1
                if w <= 0 or h <= 0:
                    continue
                class_id = int(item.cls[0].item())
                label = str(names.get(class_id, class_id)) if isinstance(names, dict) else str(class_id)
                detections.append({"label": label, "confidence": float(item.conf[0].item()),
                    "box": [x1 / image.width, y1 / image.height, w / image.width, h / image.height]})
        return {"ok": True, "model": os.path.basename(MODEL_PATH), "width": image.width,
                "height": image.height, "coordinate_format": "normalized_xywh_0_1", "detections": detections}
    except HTTPException:
        raise
    except Exception as exc:
        # Avoid leaking stack traces or internal paths to callers.
        raise HTTPException(status_code=500, detail=f"Inference failed: {type(exc).__name__}")
