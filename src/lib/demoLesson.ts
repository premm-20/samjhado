import type { Lesson } from "./types";

/** Built-in lesson so the board can be tried without a book or an API key. */
export const DEMO_LESSON: Lesson = {
  id: "demo-neuron",
  kind: "lesson",
  title: "Ek Neuron kaise sochta hai",
  summary: "Introduced a single artificial neuron: weighted sum, bias, sigmoid activation, a solved numerical, and how neurons form a network.",
  steps: [
    { type: "heading", text: "Ek Neuron kaise sochta hai?", say: "Chalo aaj samajhte hain ki neural network ka sabse chhota hissa, ek neuron, actually karta kya hai." },
    {
      type: "diagram",
      direction: "row",
      nodes: [
        { id: "x", label: "Inputs x" },
        { id: "s", label: "Weighted sum" },
        { id: "f", label: "Activation" },
        { id: "y", label: "Output y" },
      ],
      edges: [
        { from: "x", to: "s", label: "× w" },
        { from: "s", to: "f", label: "+ b" },
        { from: "f", to: "y" },
      ],
      say: "Yahan dekho, pehle inputs aate hain, unko weights se multiply karte hain, bias add karte hain, aur activation function final output deta hai.",
    },
    { type: "formula", latex: "z = w_1x_1 + w_2x_2 + b", text: "weighted sum", say: "Ye raha weighted sum ka formula. Har input x ko uske weight w se multiply karo, sab add karo, aur end mein bias b jod do." },
    { type: "callout", tone: "analogy", text: "Weights = kis cheez ko kitna bhaav dena hai. Jaise exam choose karte waqt marks ko zyada, distance ko kam.", say: "Isko aise socho, weights batate hain ki kis input ko kitni importance deni hai." },
    {
      type: "plot",
      fn: "1/(1+exp(-x))",
      xMin: -6,
      xMax: 6,
      points: [-4, -1, 0.5, 3],
      xLabel: "z",
      yLabel: "σ(z)",
      text: "sigmoid squeeze karta hai 0 se 1 ke beech",
      say: "Ab activation dekho live. Sigmoid ka graph S shape ka hota hai. Dot ko follow karo, z bada hote hi output one ke paas pahunch jaata hai.",
    },
    {
      type: "solve",
      items: ["x_1 = 2", "x_2 = 1", "w_1 = 0.5", "w_2 = -1", "b = 0.5"],
      text: "Neuron ka output y",
      lines: [
        { latex: "z = w_1x_1 + w_2x_2 + b", note: "formula likho" },
        { latex: "z = (0.5)(2) + (-1)(1) + 0.5", note: "values substitute karo" },
        { latex: "z = 1 - 1 + 0.5", note: "multiply karo" },
        { latex: "z = 0.5", note: "add karo" },
        { latex: "y = \\sigma(0.5) = \\frac{1}{1 + e^{-0.5}}", note: "sigmoid lagao" },
        { latex: "y = \\frac{1}{1 + 0.6065} = \\frac{1}{1.6065}", note: "e⁻⁰·⁵ ≈ 0.6065" },
      ],
      answer: "y \\approx 0.62",
      say: "Chalo ek numerical step by step solve karte hain. Har line mein sirf ek kaam karenge, taaki koi step miss na ho. Final answer aata hai zero point six two.",
    },
    { type: "highlight", target: 2, say: "Yaad rakho, poora magic isi weighted sum mein hai. Training ke time hum bas yahi weights aur bias adjust karte hain." },
    {
      type: "matrix",
      matrices: [
        { label: "W", rows: [["0.5", "-1"], ["0.2", "0.8"]] },
        { label: "x", rows: [["2"], ["1"]] },
        { label: "z", rows: [["0"], ["1.2"]] },
      ],
      ops: ["\\times", "="],
      text: "do neurons ek saath: matrix multiplication",
      say: "Jab bahut saare neurons hote hain, toh hum sab weights ko ek matrix mein rakh dete hain. Ek hi multiplication mein saare neurons ka z mil jaata hai.",
    },
    {
      type: "network",
      layers: [3, 4, 4, 2],
      items: ["Input", "Hidden 1", "Hidden 2", "Output"],
      say: "Aur jab aise neurons layers mein jud jaate hain, tab banta hai neural network. Dekho signal input se output tak kaise flow karta hai, isko forward pass kehte hain.",
    },
  ],
  notes: {
    keyPoints: [
      "A neuron computes a weighted sum of its inputs, adds a bias, and passes the result through an activation function.",
      "Weights decide how important each input is; the bias shifts the output up or down.",
      "The sigmoid activation squeezes any number into the range 0 to 1, so the output can be read as a probability.",
      "Many neurons together are computed at once with a matrix multiplication: z = Wx + b.",
      "Stacking layers of neurons gives a neural network; passing inputs through it is the forward pass.",
    ],
    formulas: [
      { latex: "z = w_1x_1 + w_2x_2 + b", meaning: "Weighted sum: x = inputs, w = weights, b = bias." },
      { latex: "\\sigma(z) = \\frac{1}{1 + e^{-z}}", meaning: "Sigmoid activation, output between 0 and 1." },
    ],
    example: [
      "Given x1 = 2, x2 = 1, w1 = 0.5, w2 = -1, b = 0.5",
      "z = 0.5*2 + (-1)*1 + 0.5 = 0.5",
      "y = 1 / (1 + e^-0.5) = 1 / 1.6065 ≈ 0.62",
    ],
    tips: ["Don't forget to add the bias before applying the activation.", "e^-0.5 ≈ 0.6065 — keep 4 decimals until the final answer."],
  },
};
