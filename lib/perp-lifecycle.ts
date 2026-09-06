export type PerpLifecycleStage = "analyze" | "policy" | "preview" | "authorize" | "sign" | "execute" | "confirm" | "protect" | "monitor" | "recover" | "blocked";

export type PerpLifecycleInput = {
  riskApproved: boolean;
  preflightPassed: boolean;
  authorizationAvailable: boolean;
  authorizationSimulationPassed: boolean;
  userSignaturePresent: boolean;
  entrySubmitted: boolean;
  entryConfirmed: boolean;
  protectionConfirmed: boolean;
  criticalAlert: boolean;
};

export type PerpLifecycleState = {
  stage: PerpLifecycleStage;
  safe: boolean;
  executionAllowed: boolean;
  protectionUrgent: boolean;
  nextAction: string;
};

export function derivePerpLifecycle(input: PerpLifecycleInput): PerpLifecycleState {
  if (!input.riskApproved) return { stage: "blocked", safe: true, executionAllowed: false, protectionUrgent: false, nextAction: "Change the trade intent until deterministic Horris risk policy approves it." };
  if (!input.preflightPassed) return { stage: "preview", safe: true, executionAllowed: false, protectionUrgent: false, nextAction: "Resolve live venue readiness and exact transaction simulation failures." };
  if (!input.authorizationAvailable) return { stage: "authorize", safe: true, executionAllowed: false, protectionUrgent: false, nextAction: "Generate an exact replay-safe authorization for the simulated transaction." };
  if (!input.authorizationSimulationPassed) return { stage: "authorize", safe: true, executionAllowed: false, protectionUrgent: false, nextAction: "Simulate the signed authorization onchain before execution." };
  if (!input.userSignaturePresent) return { stage: "sign", safe: true, executionAllowed: true, protectionUrgent: false, nextAction: "Request explicit wallet approval for this exact transaction." };
  if (!input.entrySubmitted) return { stage: "execute", safe: true, executionAllowed: true, protectionUrgent: false, nextAction: "Submit the exact preflighted transaction and persist its expected order fingerprint." };
  if (!input.entryConfirmed) return { stage: "confirm", safe: false, executionAllowed: false, protectionUrgent: true, nextAction: "Confirm the entry from fresh UpDown order/position state; do not submit another entry." };
  if (!input.protectionConfirmed) return { stage: "protect", safe: false, executionAllowed: false, protectionUrgent: true, nextAction: "Install and confirm stop protection immediately. Freeze new risk until protected." };
  if (input.criticalAlert) return { stage: "recover", safe: false, executionAllowed: false, protectionUrgent: true, nextAction: "Freeze new exposure and execute only the reviewed recovery action." };
  return { stage: "monitor", safe: true, executionAllowed: false, protectionUrgent: false, nextAction: "Monitor position, protection coverage and venue state." };
}
