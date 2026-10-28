"""Train a custom Partcheck YOLO detector from a labelled YOLO-format dataset.

Example:
  python -m pip install -r detector/requirements.txt
  python detector/train.py --data /data/partcheck/data.yaml --weights yolov8s.pt --epochs 100

The data.yaml must point to train/val image folders and define class names.
"""
import argparse
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', required=True, help='Path to your labelled YOLO data.yaml')
    parser.add_argument('--weights', default='yolov8s.pt', help='Starting weights; training will adapt them to your classes')
    parser.add_argument('--epochs', type=int, default=100)
    parser.add_argument('--imgsz', type=int, default=960)
    parser.add_argument('--batch', type=int, default=8)
    parser.add_argument('--device', default='0', help='0 for first CUDA GPU, cpu for CPU training')
    args = parser.parse_args()
    if not Path(args.data).is_file():
        raise SystemExit(f'Dataset YAML not found: {args.data}')
    from ultralytics import YOLO
    model = YOLO(args.weights)
    result = model.train(data=args.data, epochs=args.epochs, imgsz=args.imgsz,
                         batch=args.batch, device=args.device, project='runs/partcheck',
                         name='defect-detector', patience=20, plots=True)
    best = Path(result.save_dir) / 'weights' / 'best.pt'
    if best.exists():
        print(f'Best weights: {best}')
        print('Copy this file to detector/models/partcheck.pt before deployment.')
    print('Review validation metrics and false negatives before any operational use.')

if __name__ == '__main__':
    main()
