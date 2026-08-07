import { Badge } from "@/components/ui/badge.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";
import type {
	AnalyzeZeroResultsInput,
	AnalyzeZeroResultsOutput,
} from "../../../api/tools/analyzeZeroResults.ts";

const CAUSE_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
	typo: { label: "typo", variant: "destructive" },
	sinonimo: { label: "sinônimo", variant: "default" },
	nao_catalogado: { label: "não catalogado", variant: "secondary" },
	regionalismo: { label: "regionalismo", variant: "secondary" },
};

export default function AnalyzeZeroResultsPage() {
	const state = useMcpState<AnalyzeZeroResultsInput, AnalyzeZeroResultsOutput>();

	if (state.status === "initializing" || state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Analisando buscas com zero resultados...</span>
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
					<span className="text-sm">Classificando causas...</span>
				</div>
			</div>
		);
	}

	const result = state.toolResult;
	if (!result) return null;

	return (
		<div className="min-h-dvh p-6">
			<div className="mx-auto max-w-2xl space-y-4">
				<Card>
					<CardHeader>
						<CardTitle className="text-lg">🔍 Análise de Zero Resultados</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-muted-foreground">{result.summary}</p>
						<div className="overflow-x-auto rounded-lg border">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b bg-muted/50 text-left">
										<th className="p-2 font-medium">Termo</th>
										<th className="p-2 font-medium">Volume</th>
										<th className="p-2 font-medium">Causa</th>
										<th className="p-2 font-medium">Correção sugerida</th>
									</tr>
								</thead>
								<tbody>
									{result.report.map((r) => {
										const cause = CAUSE_LABEL[r.cause] ?? {
											label: r.cause,
											variant: "secondary" as const,
										};
										return (
											<tr key={r.term} className="border-b last:border-0">
												<td className="p-2 font-medium">{r.term}</td>
												<td className="p-2 tabular-nums">{r.volume}</td>
												<td className="p-2">
													<Badge variant={cause.variant}>{cause.label}</Badge>
												</td>
												<td className="p-2 text-muted-foreground">
													{r.suggested_fix}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
