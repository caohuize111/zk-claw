"""
ZK-Claw: Build model_v2.onnx with in-circuit normalization.
Prepends (x - min) / (max - min) to the existing model.onnx
so that EZKL proves the entire pipeline from raw data to decision.
"""
import os
import onnx
from onnx import helper, TensorProto, numpy_helper
import numpy as np
import json

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ZKML_DIR = SCRIPT_DIR

# Load norm params
with open(f"{ZKML_DIR}/norm_params.json") as f:
    params = json.load(f)

min_vals = np.array(params["min"], dtype=np.float32)
max_vals = np.array(params["max"], dtype=np.float32)
range_vals = max_vals - min_vals + 1e-8  # avoid div by zero

# Load existing model
model = onnx.load(f"{ZKML_DIR}/model.onnx")
graph = model.graph

# Find original input
orig_input = graph.input[0]
orig_input_name = orig_input.name  # usually "input"

# Create new input (raw sensor values)
raw_input = helper.make_tensor_value_info("raw_input", TensorProto.FLOAT, [1, 4])

# Create constant tensors for min and range
min_tensor = numpy_helper.from_array(min_vals.reshape(1, 4), name="norm_min")
range_tensor = numpy_helper.from_array(range_vals.reshape(1, 4), name="norm_range")

# Create normalization nodes
sub_node = helper.make_node("Sub", inputs=["raw_input", "norm_min"], outputs=["sub_result"])
div_node = helper.make_node("Div", inputs=["sub_result", "norm_range"], outputs=[orig_input_name])

# Build new graph: prepend norm nodes, keep all original nodes
new_nodes = [sub_node, div_node] + list(graph.node)
new_initializers = [min_tensor, range_tensor] + list(graph.initializer)

new_graph = helper.make_graph(
    new_nodes,
    "weather_claim_with_norm",
    [raw_input],  # new input is raw sensor values
    list(graph.output),
    initializer=new_initializers,
)

new_model = helper.make_model(new_graph, opset_imports=model.opset_import)
new_model.ir_version = model.ir_version

# Validate
onnx.checker.check_model(new_model)

# Save
output_path = f"{ZKML_DIR}/model_v2.onnx"
onnx.save(new_model, output_path)
print(f"Saved model_v2.onnx with in-circuit normalization")
print(f"  Input: raw sensor values [temp, humidity, wind, rain]")
print(f"  Normalization: (x - [{', '.join(f'{v:.3f}' for v in min_vals)}]) / range")

# Verify with test input
import onnxruntime as ort
sess = ort.InferenceSession(output_path)
# Raw extreme weather: temp=-8, humidity=98, wind=120, rainfall=250
raw = np.array([[-8.0, 98.0, 120.0, 250.0]], dtype=np.float32)
result = sess.run(None, {sess.get_inputs()[0].name: raw})[0]
print(f"  Test (extreme weather): logits={result[0]}, decision={'CLAIM' if result[0][1] > result[0][0] else 'NORMAL'}")

# Normal weather
raw_normal = np.array([[25.0, 60.0, 15.0, 5.0]], dtype=np.float32)
result_n = sess.run(None, {sess.get_inputs()[0].name: raw_normal})[0]
print(f"  Test (normal weather): logits={result_n[0]}, decision={'CLAIM' if result_n[0][1] > result_n[0][0] else 'NORMAL'}")
