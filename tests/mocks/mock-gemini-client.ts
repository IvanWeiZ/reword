import type { AnalysisResult } from '../../src/shared/types';

export const MOCK_FLAGGED_RESULT: AnalysisResult = {
  shouldFlag: true,
  riskLevel: 'medium',
  issues: ['passive-aggressive tone', 'dismissive'],
  explanation: 'This might come across as dismissive of their feelings',
  rewrites: [
    { label: 'Warmer', text: "That works for me! I was looking forward to our original plan though — can we reschedule?" },
    { label: 'Direct but kind', text: "Honestly I'm a little disappointed, but I understand. Let's find another time." },
    { label: 'Minimal change', text: "That works, though I had plans. Can we find another time?" },
  ],
};

export const MOCK_CLEAN_RESULT: AnalysisResult = {
  shouldFlag: false,
  riskLevel: 'low',
  issues: [],
  explanation: '',
  rewrites: [],
};
