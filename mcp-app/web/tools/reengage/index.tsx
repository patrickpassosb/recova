import { Badge } from "@/components/ui/badge.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";
import type { ReengageInput, ReengageOutput } from "../../../api/tools/reengage.ts";

export default function ReengagePage() {
	const state = useMcpState<ReengageInput, ReengageOutput>();

	if (state.status === "initializing" || state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Conectando ao reengajamento...</span>
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
					<span className="text-sm">Enviando mensagem de reengajamento...</span>
				</div>
			</div>
		);
	}

	const result = state.toolResult;
	if (!result) return null;

	return (
		<div className="min-h-dvh p-6">
			<div className="mx-auto max-w-xl space-y-4">
				<Card className={result.exhausted ? "border-destructive" : undefined}>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<span className="text-lg">⏰ Reengajamento</span>
							<Badge variant={result.exhausted ? "destructive" : "secondary"}>
								tentativa {result.attempt}/2
							</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div
							className={`rounded-lg p-4 text-sm ${
								result.exhausted
									? "bg-destructive/10 text-destructive"
									: "bg-muted"
							}`}
						>
							{result.message}
						</div>
						{result.exhausted && (
							<p className="mt-3 text-xs text-muted-foreground">
								Limite de 2 tentativas atingido — fluxo encerra no estado ❌
								(vermelho).
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
