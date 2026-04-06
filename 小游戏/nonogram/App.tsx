/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback, useRef } from "react";
import Board from "./components/Board";
import { generatePuzzle } from "./services/geminiService";
import { calculateClues, checkWinCondition, createEmptyPlayerGrid, getOverflowIndices } from "./utils/gameLogic";
import { PuzzleState, CellState, Grid } from "./types";
import { getPath } from "./utils/path";
import FooterLeftContent from './components/FooterLeftContent';
import useAudio from "./hooks/useAudio";
import InfoDialog from './components/builds/infoDialog.tsx'

const PUZZLE_WORDS = [
  "Key", "Sword", "Glasses", "Headphones", "Scissors", "Bird_In_Flight", "Fish_Skeleton", "Tree_Dead",
  "Flower_Stem", "Star_Outline", "Crown", "Anchor", "Lightning_Bolt", "Cactus", "Rocket", "Gamepad",
  "Phone_Landline", "Microphone", "Wrench", "Chair", "Spider", "Umbrella", "Ladder", "Bicycle",
  "Table", "Trophy", "Ribbon", "Fork", "Arrow"
];

const INITIAL_GRID: Grid = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 1, 0, 1, 0],
  [1, 0, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 1, 0, 1],
  [1, 1, 0, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const INITIAL_HINTS = [
  { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 2, c: 3 }, {r: 2, c: 5}, {r:2, c: 7},
];

const GAMEPAD_GRID_FALLBACK: Grid = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 0, 0, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 0, 1, 1, 0, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 1, 1, 1, 1, 1],
  [0, 1, 1, 0, 0, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const CALENDAR_GRID_FALLBACK: Grid = [
  [0, 1, 0, 0, 0, 0, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1],
  [1, 1, 0, 1, 0, 1, 0, 1], 
  [1, 0, 1, 0, 1, 0, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const PUZZLE_PATTERNS = [
  { grid: INITIAL_GRID, title: "I/O" },
  { grid: GAMEPAD_GRID_FALLBACK, title: "Gamepad" },
  { grid: CALENDAR_GRID_FALLBACK, title: "Calendar" },
];

const createStartingGrid = (size: number, hints?: { r: number, c: number }[]): Grid => {
  const grid = Array(size).fill(null).map(() => Array(size).fill(CellState.EMPTY));
  
  if (hints) {
    hints.forEach(({ r, c }) => {
      if (r < size && c < size) {
        grid[r][c] = CellState.CROSSED;
      }
    });
  }
  
  return grid;
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [level, setLevel] = useState(1);
  const [showClearBanner, setShowClearBanner] = useState(false);
  const [showPuzzleComplete, setShowPuzzleComplete] = useState(false);
  const { playForeground } = useAudio();
  const [isResetting, setIsResetting] = useState(false);
  const [hasOpenedCustomModal, setHasOpenedCustomModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isWinScreenVisible, setIsWinScreenVisible] = useState(false);

  // Prefetched data storage
  const prefetchedPuzzles = useRef<Record<number, { grid: Grid; image: string | null; source: string }>>({});

  const [gameState, setGameState] = useState<PuzzleState>({
    solution: INITIAL_GRID,
    playerGrid: createStartingGrid(8, INITIAL_HINTS),
    clues: calculateClues(INITIAL_GRID),
    isComplete: false,
    size: 8,
    title: "I/O",
  });

  useEffect(() => {
    setLevel(1);
    setCurrentPuzzleIndex(0);
    setHasOpenedCustomModal(false);
    
    const firstPattern = PUZZLE_PATTERNS[0];
    
    setGameState({
      solution: firstPattern.grid,
      playerGrid: createStartingGrid(8, INITIAL_HINTS),
      clues: calculateClues(firstPattern.grid),
      isComplete: false,
      size: 8,
      title: firstPattern.title,
    });

    setIsWinScreenVisible(false);
    setShowPuzzleComplete(false);
  }, []);

  useEffect(() => {
    if (!gameState.isComplete) return;

    if (level >= 3) {
      // start win?
    }

    const winSequenceTimer = setTimeout(() => {
      setShowClearBanner(true);
      playForeground(getPath("/media/audio/sfx/global/win.mp3"));

      setTimeout(() => {
        setShowPuzzleComplete(true);
      }, 3300);

      setTimeout(() => {
        setShowClearBanner(false);
      }, 4300);

      if (level >= 3) {
        setTimeout(() => {
          setIsWinScreenVisible(true);
        }, 6000);
      }

    }, 1000);

    return () => clearTimeout(winSequenceTimer);
  }, [gameState.isComplete, level]);

  const getUniqueRandomWords = (count: number) => {
    const shuffled = [...PUZZLE_WORDS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  // Initial Load and Immediate Background Prefetching
  useEffect(() => {
      const prefetchSequentially = async () => {
        const indicesToFetch = [1, 2]; 
        // 2. Pick 2 unique words at the start of the prefetch process
        const randomThemes = getUniqueRandomWords(indicesToFetch.length);

        for (let i = 0; i < indicesToFetch.length; i++) {
          const index = indicesToFetch[i];
          const randomTheme = randomThemes[i]; // Unique word for this level
          const pattern = PUZZLE_PATTERNS[index];
          
          try {
            const grid = await generatePuzzle(randomTheme, 8);
            
            prefetchedPuzzles.current[index] = { 
              grid: grid, 
              source: `✨ GEMINI API (${randomTheme})`,
              // @ts-ignore - adding dynamic title to the ref
              themeTitle: randomTheme 
            };
          } catch (e) {
            console.error(`Gemini prefetch failed for ${randomTheme}, using fallback.`);
            prefetchedPuzzles.current[index] = { 
              grid: pattern.grid, 
              source: "📁 FALLBACK (API FAILED)",
              // @ts-ignore
              themeTitle: pattern.title
            };
          }
        }
      };

      prefetchSequentially();
    }, []);

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (gameState.isComplete) return;
      playForeground(getPath("/media/audio/sfx/nonogram/fillspace.mp3"));
      setGameState((prev) => {
        const newGrid = prev.playerGrid.map((row) => [...row]);
        const currentState = newGrid[r][c];
        if (currentState === CellState.CROSSED) return prev;
        const nextState = currentState === CellState.FILLED ? CellState.EMPTY : CellState.FILLED;
        newGrid[r][c] = nextState;
        const isWin = checkWinCondition(newGrid, prev.solution);
        return { ...prev, playerGrid: newGrid, isComplete: isWin };
      });
    },
    [gameState.isComplete, playForeground]
  );

  const handleCellRightClick = useCallback(
    (r: number, c: number) => {
      if (gameState.isComplete) return;
      playForeground(getPath("/media/audio/sfx/nonogram/markx.mp3"));
      setGameState((prev) => {
        const newGrid = prev.playerGrid.map((row) => [...row]);
        const currentState = newGrid[r][c];
        if (currentState === CellState.FILLED) return prev;
        const nextState = currentState === CellState.CROSSED ? CellState.EMPTY : CellState.CROSSED;
        newGrid[r][c] = nextState;
        const isWin = checkWinCondition(newGrid, prev.solution);
        return { ...prev, playerGrid: newGrid, isComplete: isWin };
      });
    },
    [gameState.isComplete, playForeground]
  );

const handleGenerate = async () => {
    if (level === PUZZLE_PATTERNS.length) {
      setShowPuzzleComplete(false);
      setShowClearBanner(false);
      setShowCompletionModal(true);
      return;
    }

    setLoading(true);
    
    const nextLevel = level + 1;
    const nextIndex = (currentPuzzleIndex + 1) % PUZZLE_PATTERNS.length;
    const patternTemplate = PUZZLE_PATTERNS[nextIndex];

    const prefetchedData = prefetchedPuzzles.current[nextIndex];

    const finalGrid = prefetchedData ? prefetchedData.grid : patternTemplate.grid;
    const finalTitle = (prefetchedData as any)?.themeTitle || patternTemplate.title;

    setLevel(nextLevel);
    setCurrentPuzzleIndex(nextIndex);
    setShowPuzzleComplete(false);

    setGameState({
      solution: finalGrid,
      playerGrid: createEmptyPlayerGrid(8),
      clues: calculateClues(finalGrid),
      isComplete: false,
      size: 8,
      title: finalTitle,
    });
    
    setLoading(false);
  };

  const { rowOverflows, colOverflows } = React.useMemo(() => 
    getOverflowIndices(gameState.playerGrid, gameState.clues),
    [gameState.playerGrid, gameState.clues]
  );

  // Footer
  const overrideFooterStyle = `
    footer {
      position: static;
      padding-block: 24px;
      width: 100%;
      transition: opacity 0.5s ease;

      ${showClearBanner ? `opacity: 0;` : ``}

      @media (min-width: 1280px) {
        padding-top: 48px;
        padding-bottom: 0;
      }
    }

    main > div {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      justify-content: center;
    }
  `

  const handleReset = () => {
    setIsResetting(true);
    playForeground(getPath("/media/audio/sfx/global/buttonclick.mp3"));

    setTimeout(() => {
      // Check if we are resetting from the Win Screen (Full Game Reset)
      if (isWinScreenVisible) {
        setLevel(1);
        setCurrentPuzzleIndex(0);
        setHasOpenedCustomModal(false);
        const firstPattern = PUZZLE_PATTERNS[0];
        
        setGameState({
          solution: firstPattern.grid,
          playerGrid: createStartingGrid(8, INITIAL_HINTS),
          clues: calculateClues(firstPattern.grid),
          isComplete: false,
          size: 8,
          title: firstPattern.title,
        });

        setIsWinScreenVisible(false); // Hide the win screen
      } 
      // Otherwise, just clear the board for the current level (Soft Reset)
      else {
        setGameState(prev => ({
          ...prev,
          // If level 1, restore initial hints. Otherwise, create empty grid.
          playerGrid: level === 1 
            ? createStartingGrid(8, INITIAL_HINTS) 
            : createEmptyPlayerGrid(prev.size),
          isComplete: false,
        }));
      }

      setShowPuzzleComplete(false);
      setIsResetting(false);
    }, 500);
  };

  return (
    <div className="flex-1 w-full h-full bg-black flex flex-col text-white justify-center">
      <div className="flex justify-center w-full h-auto mt-[0]">
          <Board
            playerGrid={gameState.playerGrid}
            solution={gameState.solution}
            clues={gameState.clues}
            onCellClick={handleCellClick}
            onCellRightClick={handleCellRightClick}
            isGameOver={gameState.isComplete}
            title={gameState.title}
            rowOverflows={rowOverflows}
            colOverflows={colOverflows}
            showPuzzleComplete={showPuzzleComplete}
            showClearBanner={showClearBanner}
            isResetting={isResetting}
          />
      </div>

      <style>
        {overrideFooterStyle}
      </style>

      {isWinScreenVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/1 backdrop-blur-2xl animate-in fade-in duration-500">
          <div className="bg-black px-[55px] lg:px-[40px] py-[50px] gap-[40px] rounded-3xl shadow-2xl flex flex-col items-center mx-[55px] rainbow-border w-full max-w-[430px] text-center">
            <div>
              <h2 className="text-[48px] font-medium text-white tracking-[-1.2px] leading-[1.1]">你赢了！</h2>
              <h3 className="font-medium text-[#9BA0A6] text-[18px] leading-[1.6] tracking-[-0.36px]">你破解了所有 3 个谜题</h3>
            </div>
            <div className="flex flex-col gap-[16px] items-center">
              <button onClick={() => { handleReset(); setShowCompletionModal(false); }} className="bg-[#202020] px-[20px] py-[12px] text-white rounded-full font-medium self-center px-[28px]">再玩一次</button>
            </div>
          </div>
        </div>
      )}

      <div className={`flex flex-row items-center justify-center gap-[15.5px] mt-[48px] transition-opacity duration-500 ${showClearBanner ? 'opacity-0' : ''}`}>
        <FooterLeftContent
          levelId={level}
          totalLevels={3}
          infoText={showPuzzleComplete ? "成功！" : ""}
          onReset={handleReset}
        />
        {showPuzzleComplete && level <3 && (
          <button
          className="inline-flex text-black bg-white flex rounded-full justify-center items-center h-[48px] px-[28px] leading-0 enabled-pointer button-white"
          onClick={handleGenerate}
          >
            下一关卡
          </button>
        )}
      </div>
      <InfoDialog title="完成数织谜题" goal="填充单元格以揭示隐藏的图案。数字会提示你连续方块的大小和顺序（例如：3 1 = 先有一个3格方块，然后一个1格方块）。方块之间必须至少保留一个空格。使用X标记确定的空格。" onClose={() => {}} />
    </div>
  );
};

export default App;
