/**
 * Table des 27 handlers Forge Resolver (§13, §14, WP-L).
 *
 * Réexporte tous les resolvers implémentés dans les sous-modules :
 * - `agentPanel.ts` : getAgentPanel, attachAndDraft, detachTicket
 * - `problemsPage.ts` : getProblemsPage, confirmSuspect, rejectSuspect, splitCluster, mergeProblems, updateProblem
 * - `problemPanel.ts` : getProblemPanel
 * - `portal.ts` : getPortalBanner, meToo, getRequestDetail
 * - `settings.ts` : getSettings, saveSettings, listVocabulary, renameTerm, mergeTerms, splitTerm, getDataQuality
 * - `actions.ts` : getIssueContext, draftCustomerUpdate, matchFreeText, startBootstrap, bootstrapProgress, loadSampleData, clearSampleData
 */

import {
  bootstrapProgress,
  clearSampleData,
  draftCustomerUpdate,
  getIssueContext,
  loadSampleData,
  matchFreeText,
  startBootstrap,
} from './actions.ts';
import { attachAndDraft, detachTicket, getAgentPanel } from './agentPanel.ts';
import { getPortalBanner, getRequestDetail, meToo } from './portal.ts';
import { getProblemPanel } from './problemPanel.ts';
import {
  confirmSuspect,
  getProblemsPage,
  mergeProblems,
  rejectSuspect,
  splitCluster,
  updateProblem,
} from './problemsPage.ts';
import {
  getDataQuality,
  getSettings,
  listVocabulary,
  mergeTerms,
  renameTerm,
  saveSettings,
  splitTerm,
} from './settings.ts';

export const handlers = {
  getAgentPanel,
  attachAndDraft,
  detachTicket,
  getProblemsPage,
  getProblemPanel,
  confirmSuspect,
  rejectSuspect,
  splitCluster,
  mergeProblems,
  updateProblem,
  getIssueContext,
  getSettings,
  saveSettings,
  listVocabulary,
  renameTerm,
  mergeTerms,
  splitTerm,
  startBootstrap,
  bootstrapProgress,
  loadSampleData,
  clearSampleData,
  getDataQuality,
  getPortalBanner,
  meToo,
  getRequestDetail,
  draftCustomerUpdate,
  matchFreeText,
};

export {
  attachAndDraft,
  bootstrapProgress,
  clearSampleData,
  confirmSuspect,
  detachTicket,
  draftCustomerUpdate,
  getAgentPanel,
  getDataQuality,
  getIssueContext,
  getPortalBanner,
  getProblemPanel,
  getProblemsPage,
  getRequestDetail,
  getSettings,
  listVocabulary,
  loadSampleData,
  matchFreeText,
  mergeProblems,
  mergeTerms,
  meToo,
  rejectSuspect,
  renameTerm,
  saveSettings,
  splitCluster,
  splitTerm,
  startBootstrap,
  updateProblem,
};
