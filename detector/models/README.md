Place your custom-trained YOLO model weights here as `partcheck.pt`.

Do not use generic COCO weights as if they detect construction defects. The model must be trained/validated for your own labelled categories (for example: helmet, safety_harness, guardrail, missing_guardrail evidence where observable, crack, corrosion, concrete_spalling, damaged_scaffold_component). Object detectors cannot detect an absent object directly; absence requires scene/checklist reasoning and a visible, unambiguous inspection view.

This folder intentionally does not include model weights. Add the file yourself; model weights can be large and require a labelled dataset, training, and validation.
