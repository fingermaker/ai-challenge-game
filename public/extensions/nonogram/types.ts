/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export enum CellState {
  EMPTY = 0,
  FILLED = 1,
  CROSSED = 2,
}

export type Grid = number[][]; // 0 or 1 for solution
export type PlayerGrid = CellState[][]; // 0, 1, or 2

export interface Clues {
  rows: number[][];
  cols: number[][];
}

export interface PuzzleState {
  solution: Grid;
  playerGrid: PlayerGrid;
  clues: Clues;
  isComplete: boolean;
  size: number;
  title?: string;
}

export interface GameConfig {
  size: number;
  theme: string;
}
