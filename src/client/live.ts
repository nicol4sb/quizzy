import { useEffect, useState } from "react";

export type LiveQuestion = {
  roundId: string;
  prompt: string;
  position: number;
  totalQuestions: number;
  points: number;
  timeLimitSeconds: number;
  openedAt: string;
  answersAvailableAt: string;
  closesAt: string;
  answers: { id: string; text: string; position: number }[];
};

export type AnswerProgress = { answeredCount: number; totalPlayers: number };
export type LeaderboardEntry = {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
  correctAnswers: number;
};
export type LiveResults = {
  question: LiveQuestion;
  correctAnswerId: string;
  voteTotals: { answerId: string; count: number }[];
  answeredCount: number;
  totalPlayers: number;
  leaderboard: LeaderboardEntry[];
};

export function localUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    },
  );
}

export function useCountdown(closesAt: string | undefined): number {
  const remaining = () =>
    closesAt
      ? Math.max(
          0,
          Math.ceil((new Date(closesAt).getTime() - Date.now()) / 1000),
        )
      : 0;
  const [seconds, setSeconds] = useState(remaining);

  useEffect(() => {
    setSeconds(remaining());
    if (!closesAt) return;
    const timer = window.setInterval(() => setSeconds(remaining()), 250);
    return () => window.clearInterval(timer);
  }, [closesAt]);
  return seconds;
}
