"""Converts ISNet's float32 ONNX export to float16, keeping its float32 input and output."""

import sys

import onnx
from onnxconverter_common import float16

source, target = sys.argv[1], sys.argv[2]
model = onnx.load(source)
# The side outputs are deep supervision for training; converting them as graph outputs breaks the float16 cast.
kept = [output for output in model.graph.output if output.name == "output_image"]
del model.graph.output[:]
model.graph.output.extend(kept)
converted = float16.convert_float_to_float16(model, keep_io_types=True)
onnx.checker.check_model(converted)
onnx.save(converted, target)
