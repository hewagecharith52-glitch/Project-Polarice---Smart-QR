"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Heart, Gamepad2, Trophy, Zap } from 'lucide-react';

type Particle = { x: number; y: number; dx: number; dy: number; color: string; life: number; alpha: number };
type PowerUp = { x: number; y: number; type: 'EXPAND' | 'SLOW' | 'LIFE'; width: number; height: number; color: string; text: string };
type Brick = { x: number; y: number; status: number; hp: number; color: string; isSilver: boolean };

export default function BrickBreaker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [highScore, setHighScore] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [currentLevel, setCurrentLevel] = useState(0);

  const stateRef = useRef({
    isPlaying: false,
    gameOver: false,
    gameWon: false,
    score: 0,
    lives: 3,
    multiplier: 1,
    currentLevel: 0,
    consecutiveHits: 0,
    ball: { x: 150, y: 300, dx: 3.5, dy: -3.5, radius: 5, color: '#fff' },
    paddle: { x: 110, y: 380, width: 80, height: 8, speed: 7, color: '#3b82f6' },
    bricks: [] as Brick[][],
    particles: [] as Particle[],
    powerups: [] as PowerUp[],
    brickConfig: { rowCount: 5, columnCount: 6, width: 40, height: 14, padding: 6, offsetTop: 40, offsetLeft: 15 },
    rightPressed: false,
    leftPressed: false,
    paddleTimer: 0,
    slowTimer: 0,
  });

  useEffect(() => {
    const saved = localStorage.getItem('neonBreakerHighScore');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  const LEVELS = [
    [
      [0, 0, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 0],
      [1, 1, 2, 2, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [2, 0, 3, 3, 0, 2]
    ],
    [
      [1, 0, 1, 1, 0, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 2, 1, 1, 2, 1],
      [0, 1, 3, 3, 1, 0],
      [1, 0, 2, 2, 0, 1]
    ],
    [
      [2, 0, 2, 2, 0, 2],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 3, 3, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [2, 1, 2, 2, 1, 2]
    ]
  ];

  const initBricks = () => {
    const { rowCount, columnCount } = stateRef.current.brickConfig;
    const bricks: Brick[][] = [];
    const colors = ['#64748b', '#f43f5e', '#fbbf24', '#10b981', '#0ea5e9'];

    const levelIndex = stateRef.current.currentLevel % LEVELS.length;
    const pattern = LEVELS[levelIndex];

    for (let c = 0; c < columnCount; c++) {
      bricks[c] = [];
      for (let r = 0; r < rowCount; r++) {
        const type = pattern[r][c];
        if (type === 0) {
          bricks[c][r] = { x: 0, y: 0, status: 0, hp: 0, color: '', isSilver: false };
        } else {
          const isSilver = type === 2;
          const isBonus = type === 3;
          bricks[c][r] = {
            x: 0,
            y: 0,
            status: 1,
            hp: isSilver ? 2 : 1,
            color: isSilver ? '#cbd5e1' : (isBonus ? '#facc15' : colors[r % colors.length]),
            isSilver
          };
        }
      }
    }
    stateRef.current.bricks = bricks;
  };

  const spawnParticles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 8; i++) {
      stateRef.current.particles.push({
        x,
        y,
        dx: (Math.random() - 0.5) * 4,
        dy: (Math.random() - 0.5) * 4,
        color,
        life: 1.0,
        alpha: 1.0
      });
    }
  };

  const spawnPowerUp = (x: number, y: number) => {
    if (Math.random() > 0.20) return;

    const types: ('EXPAND' | 'SLOW' | 'LIFE')[] = ['EXPAND', 'SLOW', 'LIFE'];
    const type = types[Math.floor(Math.random() * types.length)];
    let color = '', text = '';

    if (type === 'EXPAND') { color = '#34d399'; text = 'E'; }
    if (type === 'SLOW') { color = '#fbbf24'; text = 'S'; }
    if (type === 'LIFE') { color = '#f43f5e'; text = '+'; }

    stateRef.current.powerups.push({ x, y, type, width: 20, height: 20, color, text });
  };

  const resetGame = () => {
    initBricks();
    stateRef.current.ball = { x: 150, y: 300, dx: 3.5, dy: -3.5, radius: 5, color: '#fff' };
    stateRef.current.paddle.x = 110;
    stateRef.current.paddle.width = 80;
    stateRef.current.score = 0;
    stateRef.current.lives = 3;
    stateRef.current.multiplier = 1;
    stateRef.current.currentLevel = 0;
    stateRef.current.consecutiveHits = 0;
    stateRef.current.particles = [];
    stateRef.current.powerups = [];
    stateRef.current.paddleTimer = 0;
    stateRef.current.slowTimer = 0;
    stateRef.current.gameOver = false;
    stateRef.current.gameWon = false;
    stateRef.current.isPlaying = true;

    setScore(0);
    setLives(3);
    setMultiplier(1);
    setCurrentLevel(0);
    setGameOver(false);
    setGameWon(false);
    setIsPlaying(true);
  };

  const togglePlay = () => {
    if (gameOver || gameWon) {
      resetGame();
    } else {
      const nextState = !isPlaying;
      setIsPlaying(nextState);
      stateRef.current.isPlaying = nextState;
    }
  };

  useEffect(() => {
    initBricks();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;

    const drawGrid = () => {
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvas.width; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
    };

    const updateAndDrawParticles = () => {
      for (let i = stateRef.current.particles.length - 1; i >= 0; i--) {
        const p = stateRef.current.particles[i];
        p.x += p.dx; p.y += p.dy;
        p.life -= 0.03;
        p.alpha = Math.max(0, p.life);

        if (p.life <= 0) {
          stateRef.current.particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    const updateAndDrawPowerUps = () => {
      const { paddle, powerups } = stateRef.current;
      for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        p.y += 2;

        ctx.save();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(p.x, p.y, p.width, p.height, 4);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.text, p.x + p.width / 2, p.y + p.height / 2);
        ctx.restore();

        if (
          p.y + p.height >= paddle.y && p.y <= paddle.y + paddle.height &&
          p.x + p.width >= paddle.x && p.x <= paddle.x + paddle.width
        ) {
          if (p.type === 'EXPAND') {
            paddle.width = 120;
            stateRef.current.paddleTimer = 300;
          } else if (p.type === 'SLOW') {
            stateRef.current.slowTimer = 300;
          } else if (p.type === 'LIFE') {
            stateRef.current.lives++;
            setLives(stateRef.current.lives);
          }
          powerups.splice(i, 1);
        } else if (p.y > canvas.height) {
          powerups.splice(i, 1);
        }
      }
    };

    const drawBall = () => {
      const { ball } = stateRef.current;
      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = ball.color;
      ctx.fill();
      ctx.restore();
    };

    const drawPaddle = () => {
      const { paddle } = stateRef.current;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 4);
      ctx.fillStyle = paddle.color;
      ctx.fill();

      const grad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
      grad.addColorStop(0, 'rgba(255,255,255,0.4)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    };

    const drawBricks = () => {
      const { bricks, brickConfig } = stateRef.current;
      for (let c = 0; c < brickConfig.columnCount; c++) {
        for (let r = 0; r < brickConfig.rowCount; r++) {
          const b = bricks[c][r];
          if (b.status === 1) {
            const brickX = (c * (brickConfig.width + brickConfig.padding)) + brickConfig.offsetLeft;
            const brickY = (r * (brickConfig.height + brickConfig.padding)) + brickConfig.offsetTop;
            b.x = brickX;
            b.y = brickY;

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(brickX, brickY, brickConfig.width, brickConfig.height, 3);

            if (b.isSilver && b.hp === 1) {
              ctx.fillStyle = '#64748b';
            } else {
              ctx.fillStyle = b.color;
            }

            ctx.fill();

            if (b.isSilver && b.hp === 1) {
              ctx.strokeStyle = '#0f172a';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(brickX + 5, brickY + 2);
              ctx.lineTo(brickX + 15, brickY + 8);
              ctx.lineTo(brickX + 10, brickY + 12);
              ctx.stroke();
            }

            ctx.restore();
          }
        }
      }
    };

    const collisionDetection = () => {
      const { ball, paddle, bricks, brickConfig } = stateRef.current;
      let hit = false;

      for (let c = 0; c < brickConfig.columnCount; c++) {
        for (let r = 0; r < brickConfig.rowCount; r++) {
          const b = bricks[c][r];
          if (b.status === 1) {
            if (ball.x > b.x && ball.x < b.x + brickConfig.width && ball.y > b.y && ball.y < b.y + brickConfig.height) {
              ball.dy = -ball.dy;
              hit = true;

              b.hp--;
              if (b.hp <= 0) {
                b.status = 0;
                spawnParticles(b.x + brickConfig.width / 2, b.y + brickConfig.height / 2, b.color);
                spawnPowerUp(b.x + brickConfig.width / 2, b.y);

                stateRef.current.consecutiveHits++;
                const mul = Math.min(5, Math.floor(stateRef.current.consecutiveHits / 3) + 1);
                if (mul !== stateRef.current.multiplier) {
                  stateRef.current.multiplier = mul;
                  setMultiplier(mul);
                }

                stateRef.current.score += (10 * stateRef.current.multiplier);
                setScore(stateRef.current.score);
              } else {
                spawnParticles(ball.x, ball.y, '#cbd5e1');
                stateRef.current.score += 5;
                setScore(stateRef.current.score);
              }

              let won = true;
              for (let ci = 0; ci < brickConfig.columnCount; ci++) {
                for (let ri = 0; ri < brickConfig.rowCount; ri++) {
                  if (bricks[ci][ri].status === 1) { won = false; break; }
                }
                if (!won) break;
              }

              if (won) {
                const nextLevel = (stateRef.current.currentLevel + 1) % LEVELS.length;
                stateRef.current.currentLevel = nextLevel;
                setCurrentLevel(nextLevel);
                initBricks();
                ball.x = canvasRef.current?.width ? canvasRef.current.width / 2 : 150;
                ball.y = canvasRef.current?.height ? canvasRef.current.height - 30 : 300;
                ball.dx = 3.5 * (Math.random() > 0.5 ? 1 : -1);
                ball.dy = -3.5;
                paddle.x = canvasRef.current?.width ? (canvasRef.current.width - paddle.width) / 2 : 110;
                paddle.width = 80;
                stateRef.current.paddleTimer = 0;
                stateRef.current.slowTimer = 0;
                return hit;
              }
            }
          }
        }
      }
      return hit;
    };

    const updateHighScore = (finalScore: number) => {
      setHighScore((prev) => {
        if (finalScore > prev) {
          localStorage.setItem('neonBreakerHighScore', finalScore.toString());
          return finalScore;
        }
        return prev;
      });
    };

    const draw = () => {
      if (!stateRef.current.isPlaying) {
        animationFrameId = requestAnimationFrame(draw);
        return;
      }

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      drawGrid();
      drawBricks();
      updateAndDrawParticles();
      updateAndDrawPowerUps();
      drawBall();
      drawPaddle();

      collisionDetection();

      const { ball, paddle, leftPressed, rightPressed } = stateRef.current;

      let currentBallDx = ball.dx;
      let currentBallDy = ball.dy;
      if (stateRef.current.slowTimer > 0) {
        stateRef.current.slowTimer--;
        currentBallDx *= 0.6;
        currentBallDy *= 0.6;
      }

      if (stateRef.current.paddleTimer > 0) {
        stateRef.current.paddleTimer--;
        if (stateRef.current.paddleTimer === 0) paddle.width = 80;
      }

      if (ball.x + currentBallDx > canvas.width - ball.radius || ball.x + currentBallDx < ball.radius) {
        ball.dx = -ball.dx;
      }
      if (ball.y + currentBallDy < ball.radius) {
        ball.dy = -ball.dy;
      } else if (ball.y + currentBallDy > canvas.height - ball.radius - paddle.height) {
        if (ball.x > paddle.x - 5 && ball.x < paddle.x + paddle.width + 5 && ball.y < paddle.y + paddle.height) {
          ball.dy = -Math.abs(ball.dy);
          const hitPoint = ball.x - (paddle.x + paddle.width / 2);
          ball.dx = hitPoint * 0.15;

          stateRef.current.consecutiveHits = 0;
          stateRef.current.multiplier = 1;
          setMultiplier(1);
        } else if (ball.y + currentBallDy > canvas.height - ball.radius) {
          stateRef.current.lives--;
          setLives(stateRef.current.lives);
          stateRef.current.consecutiveHits = 0;
          stateRef.current.multiplier = 1;
          setMultiplier(1);

          if (!stateRef.current.lives) {
            stateRef.current.gameOver = true;
            stateRef.current.isPlaying = false;
            setGameOver(true);
            setIsPlaying(false);
            updateHighScore(stateRef.current.score);
          } else {
            ball.x = canvas.width / 2;
            ball.y = canvas.height - 30;
            ball.dx = 3.5 * (Math.random() > 0.5 ? 1 : -1);
            ball.dy = -3.5;
            paddle.x = (canvas.width - paddle.width) / 2;
            paddle.width = 80;
            stateRef.current.paddleTimer = 0;
            stateRef.current.slowTimer = 0;
          }
        }
      }

      if (rightPressed && paddle.x < canvas.width - paddle.width) {
        paddle.x += paddle.speed;
      } else if (leftPressed && paddle.x > 0) {
        paddle.x -= paddle.speed;
      }

      ball.x += currentBallDx;
      ball.y += currentBallDy;

      animationFrameId = requestAnimationFrame(draw);
    };

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    draw();

    const keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === "Right" || e.key === "ArrowRight") stateRef.current.rightPressed = true;
      else if (e.key === "Left" || e.key === "ArrowLeft") stateRef.current.leftPressed = true;
    };

    const keyUpHandler = (e: KeyboardEvent) => {
      if (e.key === "Right" || e.key === "ArrowRight") stateRef.current.rightPressed = false;
      else if (e.key === "Left" || e.key === "ArrowLeft") stateRef.current.leftPressed = false;
    };

    const touchMoveHandler = (e: TouchEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const relativeX = e.touches[0].clientX - rect.left;
      if (relativeX > 0 && relativeX < canvasRef.current.width) {
        stateRef.current.paddle.x = relativeX - stateRef.current.paddle.width / 2;
        if (stateRef.current.paddle.x < 0) stateRef.current.paddle.x = 0;
        if (stateRef.current.paddle.x + stateRef.current.paddle.width > canvasRef.current.width) {
          stateRef.current.paddle.x = canvasRef.current.width - stateRef.current.paddle.width;
        }
      }
    };

    const mouseMoveHandler = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      if (relativeX > 0 && relativeX < canvasRef.current.width) {
        stateRef.current.paddle.x = relativeX - stateRef.current.paddle.width / 2;
        if (stateRef.current.paddle.x < 0) stateRef.current.paddle.x = 0;
        if (stateRef.current.paddle.x + stateRef.current.paddle.width > canvasRef.current.width) {
          stateRef.current.paddle.x = canvasRef.current.width - stateRef.current.paddle.width;
        }
      }
    };

    document.addEventListener("keydown", keyDownHandler, false);
    document.addEventListener("keyup", keyUpHandler, false);

    const containerEl = containerRef.current;
    if (containerEl) {
      containerEl.addEventListener("touchmove", touchMoveHandler, { passive: true });
      containerEl.addEventListener("touchstart", touchMoveHandler, { passive: true });
      containerEl.addEventListener("mousemove", mouseMoveHandler, false);
    }

    return () => {
      stateRef.current.isPlaying = false;
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener("keydown", keyDownHandler);
      document.removeEventListener("keyup", keyUpHandler);
      if (containerEl) {
        containerEl.removeEventListener("touchmove", touchMoveHandler);
        containerEl.removeEventListener("touchstart", touchMoveHandler);
        containerEl.removeEventListener("mousemove", mouseMoveHandler);
      }
    };
  }, []);

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl font-sans flex flex-col items-center select-none touch-none">
      {/* Header Info */}
      <div className="w-full bg-[#0b1121] text-white p-3 flex justify-between items-center text-sm font-bold border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-amber-400 text-xs tracking-wider">{highScore}</span>
          </div>
          {multiplier > 1 && (
            <div className="flex items-center gap-1 text-cyan-400 animate-pulse text-xs bg-cyan-900/30 px-2 py-1 rounded-md border border-cyan-800">
              <Zap className="w-3 h-3 fill-cyan-400" /> x{multiplier}
            </div>
          )}
          <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold ml-1">
            Lvl {currentLevel + 1}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest">Score</span>
            <span className="text-emerald-400 text-base">{score}</span>
          </div>
          <div className="flex gap-1 bg-slate-900 p-1.5 rounded-md border border-slate-800">
            {[...Array(3)].map((_, i) => (
              <Heart
                key={i}
                className={`w-3.5 h-3.5 transition-all ${i < lives ? 'text-rose-500 fill-rose-500' : 'text-slate-800'
                  }`}
              />
            ))}
            {lives > 3 && <span className="text-rose-500 text-xs ml-1 font-bold">+{lives - 3}</span>}
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div className="relative touch-none" ref={containerRef}>
        <canvas
          ref={canvasRef}
          width={300}
          height={400}
          className="block mx-auto cursor-none touch-none bg-[#0f172a]"
        />

        {/* Overlays */}
        {!isPlaying && !gameOver && !gameWon && (
          <div className="absolute inset-0 bg-[#0f172a]/60 backdrop-blur-[2px] flex items-center justify-center">
            <button
              onClick={togglePlay}
              className="bg-cyan-500 hover:bg-cyan-400 text-[#0f172a] p-4 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.6)] transition-all active:scale-90"
            >
              <Play className="w-8 h-8 ml-1 fill-[#0f172a]" />
            </button>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 bg-[#0f172a]/90 flex flex-col items-center justify-center text-white p-6 text-center animate-in fade-in zoom-in duration-300 backdrop-blur-sm">
            <Gamepad2 className="w-12 h-12 text-rose-500 mb-2 drop-shadow-[0_0_10px_rgba(244,63,94,0.8)]" />
            <h3 className="text-2xl font-black tracking-wider text-rose-500 mb-1">GAME OVER</h3>
            <p className="text-slate-400 mb-6 font-medium text-sm">
              Final Score: <span className="text-emerald-400 font-bold">{score}</span>
            </p>
            <button
              onClick={resetGame}
              className="flex items-center gap-2 bg-slate-800 text-white border border-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all"
            >
              <RotateCcw className="w-5 h-5 text-cyan-400" /> Play Again
            </button>
          </div>
        )}

        {gameWon && (
          <div className="absolute inset-0 bg-[#0f172a]/90 flex flex-col items-center justify-center text-white p-6 text-center animate-in fade-in zoom-in duration-300 backdrop-blur-sm">
            <Trophy className="w-12 h-12 text-amber-400 mb-2 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
            <h3 className="text-2xl font-black tracking-wider text-amber-400 mb-1">YOU WIN!</h3>
            <p className="text-slate-400 mb-6 font-medium text-sm">
              Final Score: <span className="text-emerald-400 font-bold">{score}</span>
            </p>
            <button
              onClick={resetGame}
              className="flex items-center gap-2 bg-slate-800 text-white border border-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all"
            >
              <RotateCcw className="w-5 h-5 text-cyan-400" /> Play Again
            </button>
          </div>
        )}
      </div>

      {/* Controls / Footer */}
      <div className="w-full bg-[#0b1121] p-2 flex justify-between items-center text-[10px] text-slate-500 font-medium border-t border-slate-800 uppercase tracking-widest">
        <span>Drag or ← →</span>
        <button onClick={togglePlay} className="flex items-center gap-1 hover:text-cyan-400 transition-colors p-1">
          {isPlaying ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Play</>}
        </button>
      </div>
    </div>
  );
}