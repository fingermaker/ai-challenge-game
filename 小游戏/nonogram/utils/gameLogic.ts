/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { Grid, PlayerGrid, Clues, CellState } from "../types";

export const calculateClues = (solution: Grid): Clues => {
  const rows = solution.map(row => {
    const clues: number[] = [];
    let currentRun = 0;
    for (const cell of row) {
      if (cell === 1) {
        currentRun++;
      } else if (currentRun > 0) {
        clues.push(currentRun);
        currentRun = 0;
      }
    }
    if (currentRun > 0) {
      clues.push(currentRun);
    }
    return clues.length > 0 ? clues : [0];
  });

  const size = solution.length;
  const cols = Array.from({ length: size }, (_, colIndex) => {
    const column = solution.map(row => row[colIndex]);
    const clues: number[] = [];
    let currentRun = 0;
    for (const cell of column) {
      if (cell === 1) {
        currentRun++;
      } else if (currentRun > 0) {
        clues.push(currentRun);
        currentRun = 0;
      }
    }
    if (currentRun > 0) {
      clues.push(currentRun);
    }
    return clues.length > 0 ? clues : [0];
  });

  return { rows, cols };
};

export const checkWinCondition = (playerGrid: PlayerGrid, solution: Grid): boolean => {
  // A win is when every FILLED cell in player matches solution.
  // EMPTY and CROSSED are treated as empty for solution checking.
  // However, strict Picross usually requires the pattern to be exact.
  // We will check that every cell that SHOULD be filled IS filled,
  // and every cell that SHOULD NOT be filled IS NOT filled.

  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < solution[0].length; c++) {
      const target = solution[r][c];
      const actual = playerGrid[r][c];

      const isFilled = actual === CellState.FILLED;
      const shouldBeFilled = target === 1;

      if (isFilled !== shouldBeFilled) {
        return false;
      }
    }
  }
  return true;
};

export const createEmptyPlayerGrid = (size: number): PlayerGrid => {
  return Array.from({ length: size }, () => Array(size).fill(CellState.EMPTY));
};

export const getOverflowIndices = (playerGrid: PlayerGrid, clues: Clues) => {
  const rowOverflows = clues.rows.map((rowClues, r) => {
    const filledInRow = playerGrid[r].filter(cell => cell === CellState.FILLED).length;
    const maxAllowed = rowClues.reduce((a, b) => a + b, 0);
    return filledInRow > maxAllowed;
  });

  const colOverflows = clues.cols.map((colClues, c) => {
    let filledInCol = 0;
    for (let r = 0; r < playerGrid.length; r++) {
      if (playerGrid[r][c] === CellState.FILLED) filledInCol++;
    }
    const maxAllowed = colClues.reduce((a, b) => a + b, 0);
    return filledInCol > maxAllowed;
  });

  return { rowOverflows, colOverflows };
};
