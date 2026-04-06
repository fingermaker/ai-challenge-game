/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useMemo } from "react";
import { CellState } from "../types";
import { getPath } from "../utils/path";

interface CellProps {
  state: CellState;
  onClick: () => void;
  onRightClick: (e: React.MouseEvent) => void;
  rowIndex: number;
  colIndex: number;
  isSolution: boolean;
  size: number;
  isResetting?: boolean;
  isGameOver: boolean;
}

const Cell: React.FC<CellProps> = ({
  state,
  isSolution,
  onClick,
  onRightClick,
  rowIndex,
  colIndex,
  size,
  isGameOver,
  isResetting,
}) => {
  const { randomDuration, randomDelay, bgPos } = useMemo(() => {
    const x = size > 1 ? (colIndex / (size - 1)) * 100 : 0;
    const y = size > 1 ? (rowIndex / (size - 1)) * 100 : 0;
    return {
      randomDuration: Math.floor(Math.random() * 300) + 300,
      randomDelay: Math.floor(Math.random() * 150),
      bgPos: `${x}% ${y}%`,
    };
  }, [colIndex, rowIndex, size]);

  const borderRight =
    (colIndex + 1) % 4 === 0 && colIndex !== size - 1
      ? "border-r border-[#fff]"
      : "border-r border-[#fff]";
  const borderBottom =
    (rowIndex + 1) % 4 === 0 && rowIndex !== size - 1
      ? "border-b border-[#fff]"
      : "border-b border-[#fff]";

  const isFilled = state === CellState.FILLED;

  return (
    <div
      className={`
        relative flex items-center justify-center 
        select-none bg-[#202020] transition-colors
        ${borderRight} ${borderBottom}
        ${(isGameOver || isResetting) 
        ? "cursor-default" 
        : "cursor-pointer hover:bg-[#2a2a2a]"}
        w-8 h-8 sm:w-[44px] sm:h-[44px] md:w-[52px] md:h-[52px]
      `}
      onMouseDown={(e) => {
        if (isGameOver || isResetting) return;
        if (e.button === 0) onClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!isGameOver && !isResetting) onRightClick(e);
      }}
    >
      {/* This is the "Sprite Layer". 
        By fading THIS and not the parent, the borders stay visible.
      */}
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          backgroundImage: isFilled ? `url('${getPath("/media/images/builds/nonogram-gradient.png")}')` : "none",
          backgroundPosition: bgPos,
          backgroundSize: `${size * 100}% ${size * 100}%`,
          backgroundRepeat: "no-repeat",
          // The magic fade logic
          opacity: isResetting ? 0 : 1,
          transitionDuration: isResetting ? `${randomDuration}ms` : "100ms",
          transitionDelay: isResetting ? `${randomDelay}ms` : "0ms",
        }}
      />

      {/* UI Markers (X's and Dots) 
        We wrap them in a div so they also respect the reset fade 
      */}
      {!isResetting && (
        <div className="relative z-10 flex items-center justify-center w-full h-full">
          {state === CellState.CROSSED && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-1/2 h-1/2 text-white">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(Cell);