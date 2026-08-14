'use strict';

/* Red neuronal feedforward simple (multicapa) con backpropagation, sin dependencias. */
class NeuralNetwork {
  constructor(sizes) {
    this.sizes = sizes;
    this.weights = [];
    this.biases = [];
    for (let l = 1; l < sizes.length; l++) {
      const rows = sizes[l];
      const cols = sizes[l - 1];
      const w = [];
      for (let i = 0; i < rows; i++) {
        const row = [];
        for (let j = 0; j < cols; j++) {
          row.push((Math.random() * 2 - 1) * Math.sqrt(2 / cols));
        }
        w.push(row);
      }
      this.weights.push(w);
      this.biases.push(new Array(rows).fill(0).map(() => (Math.random() * 2 - 1) * 0.1));
    }
  }

  static sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  static sigmoidDerivative(y) {
    return y * (1 - y);
  }

  forward(input) {
    const activations = [input];
    let a = input;
    for (let l = 0; l < this.weights.length; l++) {
      const w = this.weights[l];
      const b = this.biases[l];
      const next = new Array(w.length);
      for (let i = 0; i < w.length; i++) {
        let sum = b[i];
        for (let j = 0; j < a.length; j++) sum += w[i][j] * a[j];
        next[i] = NeuralNetwork.sigmoid(sum);
      }
      activations.push(next);
      a = next;
    }
    return activations;
  }

  predict(input) {
    const activations = this.forward(input);
    return activations[activations.length - 1];
  }

  trainStep(input, target, lr) {
    const activations = this.forward(input);
    const L = this.weights.length;
    const deltas = new Array(L);

    const output = activations[L];
    deltas[L - 1] = output.map((o, i) => (o - target[i]) * NeuralNetwork.sigmoidDerivative(o));

    for (let l = L - 2; l >= 0; l--) {
      const w = this.weights[l + 1];
      const a = activations[l + 1];
      const nextDelta = deltas[l + 1];
      const d = new Array(a.length).fill(0);
      for (let j = 0; j < a.length; j++) {
        let sum = 0;
        for (let i = 0; i < w.length; i++) sum += w[i][j] * nextDelta[i];
        d[j] = sum * NeuralNetwork.sigmoidDerivative(a[j]);
      }
      deltas[l] = d;
    }

    for (let l = 0; l < L; l++) {
      const w = this.weights[l];
      const b = this.biases[l];
      const prevA = activations[l];
      const d = deltas[l];
      for (let i = 0; i < w.length; i++) {
        for (let j = 0; j < prevA.length; j++) {
          w[i][j] -= lr * d[i] * prevA[j];
        }
        b[i] -= lr * d[i];
      }
    }

    const out = activations[L];
    let loss = 0;
    for (let i = 0; i < out.length; i++) loss += (out[i] - target[i]) ** 2;
    return loss / out.length;
  }
}

/* --- Demo: aprender la función XOR --- */
(function () {
  const XOR_DATA = [
    { input: [0, 0], target: [0] },
    { input: [0, 1], target: [1] },
    { input: [1, 0], target: [1] },
    { input: [1, 1], target: [0] },
  ];

  const canvas = document.getElementById('nn-canvas');
  const ctx = canvas.getContext('2d');
  const lossValueEl = document.getElementById('loss-value');
  const epochValueEl = document.getElementById('epoch-value');
  const outputsEl = document.getElementById('nn-outputs');
  const trainBtn = document.getElementById('train-btn');
  const resetBtn = document.getElementById('reset-btn');

  const LAYER_SIZES = [2, 4, 4, 1];
  let net = new NeuralNetwork(LAYER_SIZES);
  let epoch = 0;
  let running = false;
  let rafId = null;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const padX = 50;
    const usableW = w - padX * 2;
    const positions = LAYER_SIZES.map((count, l) => {
      const x = padX + (usableW * l) / (LAYER_SIZES.length - 1);
      const gap = h / (count + 1);
      return new Array(count).fill(0).map((_, i) => ({ x, y: gap * (i + 1) }));
    });
    return positions;
  }

  function weightColor(v) {
    const t = Math.max(-1, Math.min(1, v));
    if (t >= 0) {
      const a = Math.min(1, t);
      return `rgba(79, 209, 165, ${0.15 + a * 0.85})`;
    }
    const a = Math.min(1, -t);
    return `rgba(226, 104, 90, ${0.15 + a * 0.85})`;
  }

  function draw(activations) {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const pos = layout();

    for (let l = 0; l < net.weights.length; l++) {
      const w = net.weights[l];
      for (let i = 0; i < w.length; i++) {
        for (let j = 0; j < w[i].length; j++) {
          const from = pos[l][j];
          const to = pos[l + 1][i];
          ctx.strokeStyle = weightColor(w[i][j]);
          ctx.lineWidth = Math.min(4, 0.5 + Math.abs(w[i][j]) * 2);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }
      }
    }

    for (let l = 0; l < pos.length; l++) {
      for (let i = 0; i < pos[l].length; i++) {
        const { x, y } = pos[l][i];
        const value = activations ? activations[l][i] : 0.5;
        const radius = 14;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        const lightness = Math.round(30 + value * 50);
        ctx.fillStyle = `hsl(160, 60%, ${lightness}%)`;
        ctx.fill();
        ctx.strokeStyle = '#2a343f';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  function renderOutputs() {
    outputsEl.innerHTML = '';
    for (const sample of XOR_DATA) {
      const out = net.predict(sample.input)[0];
      const row = document.createElement('div');
      row.className = 'nn-output-row';
      row.innerHTML =
        `<span>[${sample.input.join(', ')}]</span>` +
        `<span class="nn-arrow">→</span>` +
        `<span class="nn-predicted">${out.toFixed(3)}</span>` +
        `<span class="nn-expected">(esperado: ${sample.target[0]})</span>`;
      outputsEl.appendChild(row);
    }
  }

  function trainEpoch() {
    let totalLoss = 0;
    for (const sample of XOR_DATA) {
      totalLoss += net.trainStep(sample.input, sample.target, 0.6);
    }
    epoch++;
    return totalLoss / XOR_DATA.length;
  }

  function loop() {
    if (!running) return;
    let loss = 0;
    for (let i = 0; i < 20; i++) loss = trainEpoch();
    lossValueEl.textContent = loss.toFixed(4);
    epochValueEl.textContent = epoch;
    draw(net.forward(XOR_DATA[epoch % XOR_DATA.length].input));
    renderOutputs();
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    trainBtn.textContent = 'Pausar';
    loop();
  }

  function pause() {
    running = false;
    trainBtn.textContent = 'Entrenar';
    if (rafId) cancelAnimationFrame(rafId);
  }

  function reset() {
    pause();
    net = new NeuralNetwork(LAYER_SIZES);
    epoch = 0;
    lossValueEl.textContent = '—';
    epochValueEl.textContent = '0';
    draw(net.forward([0, 0]));
    renderOutputs();
  }

  trainBtn.addEventListener('click', () => (running ? pause() : start()));
  resetBtn.addEventListener('click', reset);
  window.addEventListener('resize', () => {
    resizeCanvas();
    draw(net.forward([0, 0]));
  });

  resizeCanvas();
  draw(net.forward([0, 0]));
  renderOutputs();
})();
