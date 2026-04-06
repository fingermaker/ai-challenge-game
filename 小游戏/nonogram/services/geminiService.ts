/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Type } from "@google/genai";
import { Grid } from "../types";

const FALLBACK_GRID: Grid = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 0, 0, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 1, 1, 1, 0, 0],
  [0, 1, 0, 0, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 0, 1, 0],
  [0, 0, 1, 1, 1, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

export const generatePuzzle = async (theme: string, size: number = 8): Promise<Grid> => {
  const apiKey = process.env.API_KEY;
  const ai = new GoogleGenAI({ 
    apiKey: apiKey || "",
    httpOptions: { baseUrl: window.location.origin + "/api/gemini-proxy" }
  });

  try {
    const prompt = `Generate a binary ${size}x${size} grid for a nonogram. 
    Subject: ${theme || "a simple tech-related icon like a chip, monitor, mouse, or robot"}. 
    Style: Iconic, high-contrast pixel art. 
    Format: Return ONLY a 2D array of 0 (empty) and 1 (filled). 
    Ensure roughly 40-60 percent of the cells are filled. Avoid solid blocks or single-line patterns
    Important: The shape must be clearly recognizable. Imagine you are designing a pixelated icon for Classic computer.
    Ensure there is holes in the shapes we want spaced out cells sometimes. Use recognizable shapes. Precise shapes.
    enough to be solved as a nonogram puzzle. Do not make it symmetrical.
    Important: The shape must be clearly recognizable, yet simple enough to be solved as a nonogram puzzle. Do not make it symmetrical.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
          },
        },
      },
    });

    const grid = JSON.parse(response.text || "[]") as Grid;
    if (grid.length === size) return grid;
    return FALLBACK_GRID;
  } catch (error) {
    console.error("AI Compile Error:", error);
    return FALLBACK_GRID;
  }
};
