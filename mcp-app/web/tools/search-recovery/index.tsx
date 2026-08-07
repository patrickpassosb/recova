import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import type {
	SearchRecoveryInput,
	SearchRecoveryOutput,
} from "../../../api/tools/searchRecovery.ts";

function formatPrice(price: number): string {
	return `R$ ${price.toFixed(2).replace(".", ",")}`;
}

export default function SearchRecoveryPage() {
	const state = useMcpState<SearchRecoveryInput, SearchRecoveryOutput>();
	const app = useMcpApp();

	if (state.status === "initializing" || state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Conectando ao agente de recuperação...</span>
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
					<span className="text-sm">
						Buscando produtos para "{state.toolInput?.query ?? ""}"...
					</span>
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
						<CardTitle className="flex items-center gap-2">
							<span className="text-lg">🛒 Search Recovery</span>
							<Badge variant="secondary">sessão {result.session_id.slice(0, 8)}</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-muted-foreground">{result.explanation}</p>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							{result.products.map((p) => (
								<div
									key={p.id}
									className="flex items-center gap-3 rounded-lg border p-3"
								>
									{p.image ? (
										<img
											src={p.image}
											alt={p.title}
											className="size-14 shrink-0 rounded-md object-cover"
										/>
									) : (
										<div className="size-14 shrink-0 rounded-md bg-muted" />
									)}
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{p.title}</p>
										<p className="text-xs text-muted-foreground">
											{formatPrice(p.price)}
										</p>
									</div>
									<Badge
										variant={p.match_type === "MATCH" ? "default" : "secondary"}
									>
										{p.match_type}
									</Badge>
								</div>
							))}
						</div>
						<div className="rounded-lg bg-muted p-3">
							<p className="text-sm">
								<span className="font-medium">Pergunta: </span>
								{result.follow_up_question}
							</p>
						</div>
						<Button
							onClick={() => {
								app?.sendMessage({
									role: "user",
									content: [
										{
											type: "text",
											text: `O cliente respondeu: "${result.follow_up_question}" — continue a conversa com a tool converse usando a sessão ${result.session_id}.`,
										},
									],
								});
							}}
						>
							Continuar conversa
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
