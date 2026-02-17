"""
ZK-Claw: Train a small PyTorch MLP for DePIN weather -> insurance claim decision.
Exports to ONNX for EZKL ZKML pipeline.

Features: temperature, humidity, wind_speed, rainfall (4 floats)
Output: [prob_normal, prob_claim] (2 floats, softmax)
"""

import numpy as np
import json
import torch
import torch.nn as nn
import torch.optim as optim

# --- Generate synthetic DePIN weather training data ---
np.random.seed(42)
n_samples = 2000

temperature = np.random.uniform(-10, 45, n_samples)
humidity = np.random.uniform(10, 100, n_samples)
wind_speed = np.random.uniform(0, 150, n_samples)
rainfall = np.random.uniform(0, 300, n_samples)

X = np.column_stack([temperature, humidity, wind_speed, rainfall]).astype(np.float32)

# Normalize to [0, 1]
X_min = X.min(axis=0)
X_max = X.max(axis=0)
X_norm = (X - X_min) / (X_max - X_min + 1e-8)

# Label: trigger claim if extreme conditions
y = (
    (temperature < -5) |
    (temperature > 40) |
    (wind_speed > 100) |
    (rainfall > 200) |
    ((humidity > 95) & (rainfall > 100))
).astype(np.int64)

print(f"Training data: {n_samples} samples, {y.sum()} claims ({y.mean()*100:.1f}%)")

# --- Define tiny MLP (EZKL-friendly: Linear + ReLU only) ---
class WeatherClaimMLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(4, 32),
            nn.ReLU(),
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, 2),  # 2-class output (no softmax - EZKL handles raw logits)
        )

    def forward(self, x):
        return self.net(x)

model = WeatherClaimMLP()
print(f"Model parameters: {sum(p.numel() for p in model.parameters())}")

# --- Train ---
X_tensor = torch.tensor(X_norm, dtype=torch.float32)
y_tensor = torch.tensor(y, dtype=torch.long)

criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.003)
scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=300, gamma=0.5)

for epoch in range(1000):
    optimizer.zero_grad()
    outputs = model(X_tensor)
    loss = criterion(outputs, y_tensor)
    loss.backward()
    optimizer.step()
    scheduler.step()
    if (epoch + 1) % 200 == 0:
        preds = outputs.argmax(dim=1)
        acc = (preds == y_tensor).float().mean()
        print(f"  Epoch {epoch+1}: loss={loss.item():.4f}, acc={acc.item()*100:.1f}%")

# Final accuracy
with torch.no_grad():
    preds = model(X_tensor).argmax(dim=1)
    acc = (preds == y_tensor).float().mean()
print(f"Final accuracy: {acc.item()*100:.1f}%")

# --- Export to ONNX ---
model.eval()
dummy_input = torch.randn(1, 4)
onnx_path = "/Users/xiaobai/Desktop/zk-claw/zkml/model.onnx"
torch.onnx.export(
    model,
    dummy_input,
    onnx_path,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes=None,
    opset_version=18,
)
print(f"ONNX model saved: {onnx_path}")

# --- Save normalization params for later use ---
norm_params = {
    "min": X_min.tolist(),
    "max": X_max.tolist(),
    "features": ["temperature", "humidity", "wind_speed", "rainfall"]
}
with open("/Users/xiaobai/Desktop/zk-claw/zkml/norm_params.json", "w") as f:
    json.dump(norm_params, f, indent=2)

# --- Generate sample inputs for EZKL ---
def normalize(raw):
    return [
        float((raw[i] - X_min[i]) / (X_max[i] - X_min[i] + 1e-8))
        for i in range(4)
    ]

# Extreme weather: temp=-8, humidity=98, wind=120, rainfall=250
extreme = normalize([-8.0, 98.0, 120.0, 250.0])
sample_input = {"input_data": [extreme]}
with open("/Users/xiaobai/Desktop/zk-claw/zkml/input.json", "w") as f:
    json.dump(sample_input, f, indent=2)

with torch.no_grad():
    pred = model(torch.tensor([extreme], dtype=torch.float32))
    cls = pred.argmax(dim=1).item()
print(f"Extreme weather prediction: {'CLAIM' if cls == 1 else 'NORMAL'} (logits: {pred.tolist()[0]})")

# Normal weather: temp=25, humidity=60, wind=15, rainfall=5
normal = normalize([25.0, 60.0, 15.0, 5.0])
normal_input = {"input_data": [normal]}
with open("/Users/xiaobai/Desktop/zk-claw/zkml/input_normal.json", "w") as f:
    json.dump(normal_input, f, indent=2)

with torch.no_grad():
    pred_n = model(torch.tensor([normal], dtype=torch.float32))
    cls_n = pred_n.argmax(dim=1).item()
print(f"Normal weather prediction: {'CLAIM' if cls_n == 1 else 'NORMAL'} (logits: {pred_n.tolist()[0]})")
