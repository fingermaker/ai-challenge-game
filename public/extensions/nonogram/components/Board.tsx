/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useState, useRef } from "react";
import Cell from "./Cell";
import { PlayerGrid, Clues } from "../types";
import { getPath } from "../utils/path";
import { createPortal } from "react-dom";

interface BoardProps {
  playerGrid: PlayerGrid;
  clues: Clues;
  onCellClick: (r: number, c: number) => void;
  onCellRightClick: (r: number, c: number) => void;
  isGameOver: boolean;
  isResetting?: boolean;
  solution: number[][];
  title?: string;
  rewardImage?: string | null;
  showPuzzleComplete?: boolean;
  showClearBanner?: boolean;
  rowOverflows?: boolean[]; 
  colOverflows?: boolean[];
}

const Board: React.FC<BoardProps> = ({
  playerGrid,
  solution,
  clues,
  onCellClick,
  onCellRightClick,
  isGameOver,
  isResetting,
  rewardImage,
  showPuzzleComplete,
  showClearBanner,
  title,
}) => {
  const size = playerGrid.length;
  const [delayedClear, setDelayedClear] = useState(false);
  const [dragAction, setDragAction] = useState<number | null>(null);
  const isDragging = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const lastProcessedCell = useRef<string | null>(null);
  const touchStartCell = useRef<{ r: number, c: number, originalState: number } | null>(null);
  const hasMovedSignificant = useRef(false);
  
  const gridStateRef = useRef(playerGrid);
  useEffect(() => { gridStateRef.current = playerGrid; }, [playerGrid]);

  const executeToggle = (r: number, c: number, targetState: number) => {
    const currentState = gridStateRef.current[r][c];
    if (currentState === targetState) return;
    
    if (currentState === 1) onCellClick(r, c);
    if (currentState === 2) onCellRightClick(r, c);
    if (targetState === 1) onCellClick(r, c);
    if (targetState === 2) onCellRightClick(r, c);
  };

  // --- Mouse Logic ---
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDragging.current = false;
      setDragAction(null);
      lastProcessedCell.current = null;
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const handleMouseDown = (r: number, c: number, button: number) => {
    if (isGameOver) return;
    isDragging.current = true;
    lastProcessedCell.current = `${r}-${c}`;
    const currentState = gridStateRef.current[r][c];
    const action = button === 2 ? (currentState === 2 ? 0 : 2) : (currentState === 1 ? 0 : 1);
    setDragAction(action);
    executeToggle(r, c, action);
  };

  const handleMouseEnter = (r: number, c: number) => {
    if (!isDragging.current || dragAction === null || isGameOver) return;
    const key = `${r}-${c}`;
    if (lastProcessedCell.current === key) return;
    lastProcessedCell.current = key;
    executeToggle(r, c, dragAction);
  };

    interface ClearHeadingProps {
    i: number;
    total: number;
    children: React.ReactNode;
  }

  const ClearHeading = ({ i, total, children }: { i: number; total: number; children: React.ReactNode }) => {
    const yOffset = i * 25;

    const enterDelay = (total - 1 - i) * 0.2;

    return (
      <h1
        style={{
          backgroundImage: `url(${getPath("/media/images/builds/nonogram-gradient.png")})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: `center ${yOffset}%`,
          backgroundSize: "cover",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          opacity: 0,
          animation: `fullSequence 2.5s ease-in-out 1 forwards`,
          animationDelay: `${enterDelay}s`,
        }}
        className="bg-clip-text text-[26vw] md:text-[18.5vw] leading-[21vw] md:leading-[15vw] tracking-[-1vw] font-medium select-none"
      >
        {children}
        <style>{`
          @keyframes fullSequence {
            /* 0-10%: Enter from bottom (Staggered) */
            0% {
              opacity: 0;
              transform: translateY(40px) scale(0.95);
            }

            10% {
              opacity: 1; 
              transform: translateY(0px) scale(1);
            }

            /* 15-95%: Stay in place */
            95% { 
              opacity: 1; 
              transform: translateX(0px);
            }

            100% {
              opacity: 0;
              transform: translateX(-100px);
            }
          }
        `}</style>
      </h1>
    );
    };

    useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showClearBanner) {
      setDelayedClear(true);

      timer = setTimeout(() => {
        setDelayedClear(false); 
      }, 3300); 
    }
    return () => clearTimeout(timer);
  }, [showClearBanner]);

  // --- Touch Logic Optimized to prevent "Flicker" ---
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || isGameOver) return;

    const handleNativeTouch = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cellEl = el?.closest("[data-cell-pos]");
      if (!cellEl) return;
      
      const posAttr = cellEl.getAttribute("data-cell-pos")!;
      const [r, c] = posAttr.split("-").map(Number);

      if (e.type === "touchstart") {
        isDragging.current = true;
        hasMovedSignificant.current = false;
        lastProcessedCell.current = posAttr;
        
        const originalState = gridStateRef.current[r][c];
        touchStartCell.current = { r, c, originalState };

        // IMPROVED INTENT:
        // Only toggle immediately if the cell is EMPTY (0 -> 1).
        // If it's 1 or 2, we wait to see if it's a drag or a tap to prevent flickering.
        if (originalState === 0) {
          setDragAction(1);
          executeToggle(r, c, 1);
        } else {
          setDragAction(0); // Intent is to erase if they start moving
        }

      } else if (e.type === "touchmove" && isDragging.current) {
        if (lastProcessedCell.current !== posAttr) {
          hasMovedSignificant.current = true;
          lastProcessedCell.current = posAttr;
          
          // If we are moving and haven't erased the first cell yet, do it now
          if (touchStartCell.current && touchStartCell.current.originalState !== 0) {
             const { r: startR, c: startC } = touchStartCell.current;
             executeToggle(startR, startC, 0);
          }
          
          if (dragAction !== null) executeToggle(r, c, dragAction);
        }
      }
    };

    const handleTouchEnd = () => {
      if (!hasMovedSignificant.current && touchStartCell.current) {
        const { r, c, originalState } = touchStartCell.current;
        
        // Final Tap Cycle Logic:
        // 0 -> 1 (Already handled in touchstart)
        // 1 -> 2 (X)
        // 2 -> 0 (Empty)
        if (originalState === 1) {
          executeToggle(r, c, 2);
        } else if (originalState === 2) {
          executeToggle(r, c, 0);
        }
      }

      isDragging.current = false;
      setDragAction(null);
      lastProcessedCell.current = null;
      touchStartCell.current = null;
    };

    grid.addEventListener("touchstart", handleNativeTouch, { passive: false });
    grid.addEventListener("touchmove", handleNativeTouch, { passive: false });
    grid.addEventListener("touchend", handleTouchEnd);

    return () => {
      grid.removeEventListener("touchstart", handleNativeTouch);
      grid.removeEventListener("touchmove", handleNativeTouch);
      grid.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isGameOver, dragAction]);

  // --- Overflow Logic ---
  const getOverflows = () => {
    const rows = clues.rows.map((rClues, r) => 
      playerGrid[r].filter(cell => cell === 1).length > rClues.reduce((a, b) => a + b, 0)
    );
    const cols = clues.cols.map((cClues, c) => {
      let count = 0;
      for (let r = 0; r < size; r++) if (playerGrid[r][c] === 1) count++;
      return count > cClues.reduce((a, b) => a + b, 0);
    });
    return { rowOverflows: rows, colOverflows: cols };
  };

  const { rowOverflows, colOverflows } = getOverflows();

  useEffect(() => {
    if (showClearBanner) {
      setDelayedClear(true);
      const timer = setTimeout(() => setDelayedClear(false), 3300);
      return () => clearTimeout(timer);
    }
  }, [showClearBanner]);

  return (
    <>
      <style>{`
        @keyframes overflow-pulse { 0% { opacity: 0.2; } 50% { opacity: 1; } 100% { opacity: 0.2; } }
        .animate-overflow-flash { background-color: rgba(255, 255, 255, 0.3); position: absolute; inset: 0; pointer-events: none; z-index: 10; animation: overflow-pulse 4s ease-in-out infinite; }
        @keyframes fullSequence { 0% { opacity: 0; transform: translateY(40px) scale(0.95); } 10% { opacity: 1; transform: translateY(0px) scale(1); } 95% { opacity: 1; transform: translateX(0px); } 100% { opacity: 0; transform: translateX(-100px); } }
      `}</style>

      <div className={`flex flex-col items-center bg-[#202020] p-[17px] lg:p-[40px] rounded-2xl relative transition-opacity duration-1000 ${delayedClear ? "opacity-0" : "opacity-100"}`} onContextMenu={(e) => e.preventDefault()}>
        <div className="flex h-[50px]">
          <div className="flex-shrink-0 w-10 md:w-28 lg:w-36 border-r border-b border-white"></div>
          <div className="flex border-b border-white">
            {clues.cols.map((colClues, i) => (
              <div key={`col-${i}`} className="flex flex-col justify-end items-center w-8 sm:w-[44px] md:w-[52px] pb-2 gap-1 border-r border-white">
                {colClues.map((num, idx) => (
                  <span key={idx} className={`text-xs font-bold ${num === 0 ? "opacity-50" : ""} text-white`}>{num}</span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex">
          <div className="flex flex-col w-10 md:w-28 lg:w-36 border-r border-white">
            {clues.rows.map((rowClues, i) => (
              <div key={`row-${i}`} className="flex justify-end items-center h-8 sm:h-[44px] md:h-[52px] pr-2 gap-1.5 border-b border-white">
                {rowClues.map((num, idx) => (
                  <span key={idx} className={`text-xs font-bold ${num === 0 ? "text-[#5f5f64]" : "text-[#c6c6cb]"}`}>{num}</span>
                ))}
              </div>
            ))}
          </div>

          <div ref={gridRef} className="bg-[#202020] relative inner__grid" style={{ touchAction: 'none' }}>
            {playerGrid.map((row, r) => (
              <div key={r} className="flex">
                {row.map((cellState, c) => (
                  <div key={`${r}-${c}`} className="relative" data-cell-pos={`${r}-${c}`} onMouseDown={(e) => handleMouseDown(r, c, e.button)} onMouseEnter={() => handleMouseEnter(r, c)}>
                    <Cell state={cellState} rowIndex={r} colIndex={c} isResetting={isResetting} size={size} isGameOver={isGameOver} isSolution={solution[r][c] === 1} onClick={() => {}} onRightClick={() => {}} />
                    {(rowOverflows[r] || colOverflows[c]) && !isGameOver && <div className="absolute inset-0 pointer-events-none animate-overflow-flash z-[5]" />}
                  </div>
                ))}
              </div>
            ))}
            {rewardImage && isGameOver && showPuzzleComplete && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <img src={rewardImage} alt="Reward" className="w-full h-full object-contain" />
              </div>
            )}
          </div>
        </div>
      </div>
      {delayedClear && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[50] flex flex-col items-center justify-center pointer-events-none transition-opacity duration-1000 ease-in-out opacity-100">
          {[...Array(5)].map((_, i) => (
            <ClearHeading key={`${title}-clear-${i}`} i={i} total={5}>Clear!</ClearHeading>
          ))}
        </div>,
        document.body
      )}
    </>
  );
};

export default Board;
