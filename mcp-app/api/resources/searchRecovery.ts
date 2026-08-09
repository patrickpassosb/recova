import { createAppResource } from "./appResource.ts";
import {
	ANALYZE_RESOURCE_URI,
} from "../tools/analyzeZeroResults.ts";
import { CONVERSE_RESOURCE_URI } from "../tools/converse.ts";
import { REENGAGE_RESOURCE_URI } from "../tools/reengage.ts";
import { SEARCH_RECOVERY_RESOURCE_URI } from "../tools/searchRecovery.ts";
import { DASHBOARD_RESOURCE_URI } from "../tools/dashboard.ts";

export const searchRecoveryAppResource = createAppResource(
	SEARCH_RECOVERY_RESOURCE_URI,
	"Search Recovery UI",
	"Interface do agente de recuperação de busca: mostra produtos sugeridos, explicação e pergunta de refinamento",
);

export const converseAppResource = createAppResource(
	CONVERSE_RESOURCE_URI,
	"Converse UI",
	"Interface do loop de conversa do agente de recuperação de busca",
);

export const reengageAppResource = createAppResource(
	REENGAGE_RESOURCE_URI,
	"Reengage UI",
	"Interface do reengajamento (timeout 30s) do agente de recuperação de busca",
);

export const analyzeAppResource = createAppResource(
	ANALYZE_RESOURCE_URI,
	"Analyze Zero Results UI",
	"Interface do relatório de buscas com zero resultados",
);

export const dashboardAppResource = createAppResource(
	DASHBOARD_RESOURCE_URI,
	"Dashboard Recova",
	"Dashboard com métricas de negócio a partir dos eventos reais de instrumentação (buscas, zero-results, exposições, cliques, refinamentos, reengajamentos, compras atribuídas)",
);
