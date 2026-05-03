/**
 * Mock for lucide-react icons — returns a simple SVG element for all icons.
 * This avoids ESM parsing issues in Jest environments.
 */
import React from 'react';

const MockIcon = ({ className }: { className?: string }) =>
  React.createElement('svg', { 'data-testid': 'icon', className });

MockIcon.displayName = 'MockIcon';

// Export every named icon as the same mock component
export const Trophy = MockIcon;
export const Home = MockIcon;
export const BookOpen = MockIcon;
export const LogOut = MockIcon;
export const User = MockIcon;
export const GraduationCap = MockIcon;
export const LayoutDashboard = MockIcon;
export const Settings = MockIcon;
export const Sparkles = MockIcon;
export const Target = MockIcon;
export const BrainCircuit = MockIcon;
export const Flame = MockIcon;
export const Star = MockIcon;
export const Zap = MockIcon;
export const Clock = MockIcon;
export const ShieldCheck = MockIcon;
export const Loader2 = MockIcon;
export const Sword = MockIcon;
export const CheckCircle2 = MockIcon;
export const XCircle = MockIcon;
export const AlertCircle = MockIcon;
export const ArrowRight = MockIcon;
export const ArrowLeft = MockIcon;
export const Wand2 = MockIcon;
export const Timer = MockIcon;
export const Flag = MockIcon;
export const AlertTriangle = MockIcon;
export const Ticket = MockIcon;
export const KeySquare = MockIcon;
export const LogIn = MockIcon;
export const BookX = MockIcon;
