import { Badge } from "@/components/ui/badge.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";
import type {
	DashboardInput,
	DashboardOutput,
} from "../../../api/tools/dashboard.ts";

// Logo Recova (SVG oficial do vault) — identidade visual no dashboard.
const RECOVA_LOGO =
	"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+PCFET0NUWVBFIHN2ZyBQVUJMSUMgIi0vL1czQy8vRFREIFNWRyAxLjEvL0VOIiAiaHR0cDovL3d3dy53My5vcmcvR3JhcGhpY3MvU1ZHLzEuMS9EVEQvc3ZnMTEuZHRkIj48c3ZnIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCA1MzkgMTU5IiB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHhtbDpzcGFjZT0icHJlc2VydmUiIHN0eWxlPSJmaWxsLXJ1bGU6ZXZlbm9kZDtjbGlwLXJ1bGU6ZXZlbm9kZDtzdHJva2UtbGluZWpvaW46cm91bmQ7c3Ryb2tlLW1pdGVybGltaXQ6MjsiPjxnIGlkPSJGdW5kbyI+PHBhdGggZD0iTTc0LjgzOCw2MS41NTZjMC41NzYsLTIuNjk0IDEuMjE0LC03Ljg1MyA3LjEzMywtMTUuNzFjMTEuMTIyLC0xNC43NjYgMzUuNzA2LC0xNi44MjQgNDkuNDY3LC01LjI2NGMxMC40NjYsOC43OTMgMTMuNzExLDIzLjA0NCAxMi40NSwzMi45ODRjLTAuNDI0LDMuMzQzIC0yLjgsMi43NDcgLTQuMzkyLDIuODAyYy03LjAyMSwwLjI0MiAtNi45OTMsMC41MDMgLTE0LjAwNiwwLjY4NGMtMTcuMDExLDAuNDQgLTE2Ljk4NywwLjcwNyAtMzMuOTk0LDEuMjY4Yy0zLjQyNywwLjExMyAtNS4wNDQsLTAuMTA3IC00LjE4MSwzLjIyNmMwLjczNywyLjg0OSAyLjcyLDExLjQxOCAxMS45ODMsMTYuMzQ1YzEuNTc4LDAuODQgMTEuMzczLDYuMDQ5IDIyLjM0NiwtMC4xM2M2Ljk2NSwtMy45MjEgNi40MDMsLTYuNTc4IDkuMDA4LC01Ljc1M2MwLjU2MiwwLjE3OCAwLjYwMywwLjE5MSA1Ljc1Nyw0LjYwNGMxLjQ0NywxLjIzOCAyLjMwNCwwLjk2OCAxLjkzMiwyLjgzOWMtMC4wNzYsMC4zODIgLTAuMTQ3LDAuNzQyIC0zLjIyMSwzLjY1NGMtMTAuMTk2LDkuNjYxIC0yNS40NDMsMTAuNjcyIC0zNS43NDUsNy43NzNjLTcuMjg2LC0yLjA1MSAtMTMuMzQxLC03LjcwOSAtMTMuNDQ2LC03Ljc5OWMtMS42NjksLTEuNDMgLTUuOTYzLC02LjY4NSAtNy4wNDQsLTguNzk1Yy02Ljk3NywtMTMuNjMgLTQuOTg3LC0yNS43NzYgLTQuMDQ3LC0zMi43MjhabTIxLjY3Myw1LjEzNGMyNy41OTUsLTEuMDQgMjcuNTg5LC0xLjEzNyAyOS45ODksLTEuMTg5YzMuMTc1LC0wLjA3IDQuNTg5LDAuMTI1IDMuOTMyLC0yLjk4OGMtMC4xNDIsLTAuNjcxIC0xLjMyMSwtNy43NjQgLTcuMTA1LC0xMi44MDljLTEwLjc4NSwtOS40MDggLTMwLjAxNSwtNS43NjMgLTM1LjQ1MiwxMC45MjVjLTEuNTYxLDQuNzkgLTEuODQ3LDYuNTYgMS42MzEsNi4zMTljMC4yNTQsLTAuMDE4IDYuNDQ1LC0wLjIzOCA3LjAwNiwtMC4yNThaIiBzdHlsZT0iZmlsbDojMDcyZTUyOyIvPjwvZz48L3N2Zz4=";

function MetricCard({
	label,
	value,
	suffix = "",
	accent = "default",
}: {
	label: string;
	value: number | string;
	suffix?: string;
	accent?: "default" | "blue" | "green" | "orange";
}) {
	const accentClass =
		accent === "blue"
			? "text-[#155EEF]"
			: accent === "green"
				? "text-[#16A34A]"
				: accent === "orange"
					? "text-[#F97316]"
					: "text-[#102A43]";
	return (
		<Card className="border-[#E2E8F0] shadow-sm">
			<CardContent className="p-4">
				<p className="text-xs font-medium text-[#64748B]">{label}</p>
				<p className={`mt-1 text-2xl font-bold tabular-nums ${accentClass}`}>
					{typeof value === "number" ? value.toLocaleString("pt-BR") : value}
					{suffix}
				</p>
			</CardContent>
		</Card>
	);
}

export default function DashboardPage() {
	const state = useMcpState<DashboardInput, DashboardOutput>();

	if (state.status === "initializing" || state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Carregando dashboard...</span>
				</div>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-md border-destructive">
					<CardHeader>
						<CardTitle className="text-destructive">Erro</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-destructive">{state.error}</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "tool-input") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Agregando eventos reais...</span>
				</div>
			</div>
		);
	}

	const result = state.toolResult;
	if (!result) return null;

	const { totals, metrics } = result;

	return (
		<div className="min-h-dvh p-6">
			<div className="mx-auto max-w-4xl space-y-4">
				<Card className="border-0 shadow-md">
					<CardHeader className="bg-[#102A43] text-white rounded-t-xl flex flex-row items-center gap-3">
						<img
							src={RECOVA_LOGO}
							alt="Recova"
							className="h-8 w-auto"
						/>
						<div>
							<CardTitle className="text-lg text-white font-display">
								Dashboard Recova
							</CardTitle>
							<p className="text-sm text-slate-300">
								Métricas reais de recuperação de vendas — sem seed, sem badge.
							</p>
						</div>
					</CardHeader>
				</Card>

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<MetricCard label="Buscas" value={totals.searches} />
					<MetricCard label="Zero resultados" value={totals.zero_results} accent="orange" />
					<MetricCard label="Exposições" value={totals.exposed} />
					<MetricCard label="Compras atribuídas" value={totals.purchases} accent="green" />
				</div>

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					<MetricCard label="Taxa zero-results" value={metrics.zero_results_rate} suffix="%" accent="orange" />
					<MetricCard label="Taxa de recuperação" value={metrics.recovery_rate} suffix="%" accent="green" />
					<MetricCard label="Receita atribuída" value={`R$ ${metrics.attributed_revenue.toLocaleString("pt-BR")}`} accent="blue" />
					<MetricCard label="Receita / busca falha" value={`R$ ${metrics.revenue_per_failed_search.toLocaleString("pt-BR")}`} accent="blue" />
					<MetricCard label="CTR alternativas" value={metrics.click_through_rate} suffix="%" />
					<MetricCard label="Taxa de refinamento" value={metrics.refinement_rate} suffix="%" />
					<MetricCard label="Produtos / usuário" value={metrics.products_per_user} />
					<MetricCard label="Checkout iniciado" value={metrics.checkout_rate} suffix="%" accent="green" />
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Eventos recentes</CardTitle>
					</CardHeader>
					<CardContent>
						{result.recent.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Nenhum evento ainda. Faça uma busca com zero resultados para gerar dados reais.
							</p>
						) : (
							<div className="overflow-x-auto rounded-lg border">
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b bg-muted/50 text-left">
											<th className="p-2 font-medium">Evento</th>
											<th className="p-2 font-medium">Timestamp</th>
											<th className="p-2 font-medium">Sessão</th>
										</tr>
									</thead>
									<tbody>
										{result.recent.map((e, i) => {
											const ts = new Date(String(e.timestamp));
											const ago = Math.max(0, Math.round((Date.now() - ts.getTime()) / 1000));
											const when = ago < 60 ? `${ago}s atrás` : ago < 3600 ? `${Math.round(ago / 60)}min atrás` : ts.toLocaleString("pt-BR");
											return (
												<tr key={i} className="border-b last:border-0">
													<td className="p-2">
														<Badge variant="secondary">{String(e.event)}</Badge>
													</td>
													<td className="p-2 text-muted-foreground">{when}</td>
													<td className="p-2 text-muted-foreground">
														{String(e.session_id ?? "-").slice(0, 8)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
