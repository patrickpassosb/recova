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

function MetricCard({
	label,
	value,
	suffix = "",
}: {
	label: string;
	value: number | string;
	suffix?: string;
}) {
	return (
		<Card>
			<CardContent className="p-4">
				<p className="text-xs text-muted-foreground">{label}</p>
				<p className="mt-1 text-2xl font-bold tabular-nums">
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
				<Card>
					<CardHeader>
						<CardTitle className="text-lg">📊 Dashboard Recova</CardTitle>
						<p className="text-sm text-muted-foreground">
							100% dados reais de instrumentação — sem seed, sem badge.
						</p>
					</CardHeader>
				</Card>

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<MetricCard label="Buscas" value={totals.searches} />
					<MetricCard label="Zero resultados" value={totals.zero_results} />
					<MetricCard label="Exposições" value={totals.exposed} />
					<MetricCard label="Compras atribuídas" value={totals.purchases} />
				</div>

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					<MetricCard label="Taxa zero-results" value={metrics.zero_results_rate} suffix="%" />
					<MetricCard label="Taxa de recuperação" value={metrics.recovery_rate} suffix="%" />
					<MetricCard label="Receita atribuída" value={`R$ ${metrics.attributed_revenue.toLocaleString("pt-BR")}`} />
					<MetricCard label="Receita / busca falha" value={`R$ ${metrics.revenue_per_failed_search.toLocaleString("pt-BR")}`} />
					<MetricCard label="CTR alternativas" value={metrics.click_through_rate} suffix="%" />
					<MetricCard label="Taxa de refinamento" value={metrics.refinement_rate} suffix="%" />
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
										{result.recent.map((e, i) => (
											<tr key={i} className="border-b last:border-0">
												<td className="p-2">
													<Badge variant="secondary">{String(e.event)}</Badge>
												</td>
												<td className="p-2 text-muted-foreground">
													{new Date(String(e.timestamp)).toLocaleString("pt-BR")}
												</td>
												<td className="p-2 text-muted-foreground">
													{String(e.session_id ?? "-").slice(0, 8)}
												</td>
											</tr>
										))}
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
