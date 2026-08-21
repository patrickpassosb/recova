import { analyzeZeroResultsTool } from "./analyzeZeroResults.ts";
import { converseTool } from "./converse.ts";
import { dashboardTool } from "./dashboard.ts";
import { helloTool } from "./hello.ts";
import { reengageTool } from "./reengage.ts";
import { searchRecoveryTool } from "./searchRecovery.ts";
import { trackEventTool } from "./trackEvent.ts";

export const tools = [
	helloTool,
	searchRecoveryTool,
	converseTool,
	reengageTool,
	analyzeZeroResultsTool,
	dashboardTool,
	trackEventTool,
];
