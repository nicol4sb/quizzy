export function speedScore(maxPoints, openedAt, closesAt, receivedAt) {
    const duration = closesAt.getTime() - openedAt.getTime();
    const remaining = Math.max(0, Math.min(1, (closesAt.getTime() - receivedAt.getTime()) / duration));
    return Math.max(Math.ceil(maxPoints * 0.5), Math.ceil(maxPoints * (0.5 + remaining * 0.5)));
}
//# sourceMappingURL=scoring.js.map