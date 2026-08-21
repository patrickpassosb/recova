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
	"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+PCFET0NUWVBFIHN2ZyBQVUJMSUMgIi0vL1czQy8vRFREIFNWRyAxLjEvL0VOIiAiaHR0cDovL3d3dy53My5vcmcvR3JhcGhpY3MvU1ZHLzEuMS9EVEQvc3ZnMTEuZHRkIj48c3ZnIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCA1MzkgMTU5IiB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHhtbDpzcGFjZT0icHJlc2VydmUiIHhtbG5zOnNlcmlmPSJodHRwOi8vd3d3LnNlcmlmLmNvbS8iIHN0eWxlPSJmaWxsLXJ1bGU6ZXZlbm9kZDtjbGlwLXJ1bGU6ZXZlbm9kZDtzdHJva2UtbGluZWpvaW46cm91bmQ7c3Ryb2tlLW1pdGVybGltaXQ6MjsiPjxnIGlkPSJGdW5kbyI+PHBhdGggZD0iTTc0LjgzOCw2MS41NTZjMC41NzYsLTIuNjk0IDEuMjE0LC03Ljg1MyA3LjEzMywtMTUuNzFjMTEuMTIyLC0xNC43NjYgMzUuNzA2LC0xNi44MjQgNDkuNDY3LC01LjI2NGMxMC40NjYsOC43OTMgMTMuNzExLDIzLjA0NCAxMi40NSwzMi45ODRjLTAuNDI0LDMuMzQzIC0yLjgsMi43NDcgLTQuMzkyLDIuODAyYy03LjAyMSwwLjI0MiAtNi45OTMsMC41MDMgLTE0LjAwNiwwLjY4NGMtMTcuMDExLDAuNDQgLTE2Ljk4NywwLjcwNyAtMzMuOTk0LDEuMjY4Yy0zLjQyNywwLjExMyAtNS4wNDQsLTAuMTA3IC00LjE4MSwzLjIyNmMwLjczNywyLjg0OSAyLjcyLDExLjQxOCAxMS45ODMsMTYuMzQ1YzEuNTc4LDAuODQgMTEuMzczLDYuMDQ5IDIyLjM0NiwtMC4xM2M2Ljk2NSwtMy45MjEgNi40MDMsLTYuNTc4IDkuMDA4LC01Ljc1M2MwLjU2MiwwLjE3OCAwLjYwMywwLjE5MSA1Ljc1Nyw0LjYwNGMxLjQ0NywxLjIzOCAyLjMwNCwwLjk2OCAxLjkzMiwyLjgzOWMtMC4wNzYsMC4zODIgLTAuMTQ3LDAuNzQyIC0zLjIyMSwzLjY1NGMtMTAuMTk2LDkuNjYxIC0yNS40NDMsMTAuNjcyIC0zNS43NDUsNy43NzNjLTcuMjg2LC0yLjA1MSAtMTMuMzQxLC03LjcwOSAtMTMuNDQ2LC03Ljc5OWMtMS42NjksLTEuNDMgLTUuOTYzLC02LjY4NSAtNy4wNDQsLTguNzk1Yy02Ljk3NywtMTMuNjMgLTQuOTg3LC0yNS43NzYgLTQuMDQ3LC0zMi43MjhabTIxLjY3Myw1LjEzNGMyNy41OTUsLTEuMDQgMjcuNTg5LC0xLjEzNyAyOS45ODksLTEuMTg5YzMuMTc1LC0wLjA3IDQuNTg5LDAuMTI1IDMuOTMyLC0yLjk4OGMtMC4xNDIsLTAuNjcxIC0xLjMyMSwtNy43NjQgLTcuMTA1LC0xMi44MDljLTEwLjc4NSwtOS40MDggLTMwLjAxNSwtNS43NjMgLTM1LjQ1MiwxMC45MjVjLTEuNTYxLDQuNzkgLTEuODQ3LDYuNTYgMS42MzEsNi4zMTljMC4yNTQsLTAuMDE4IDYuNDQ1LC0wLjIzOCA3LjAwNiwtMC4yNThaIiBzdHlsZT0iZmlsbDojRkZGRkZGOyIvPjxwYXRoIGQ9Ik00ODEuNTIyLDY2LjY5N2MxLjU5NSwtMC4xMTcgMTAuMjIzLC0wLjc1MiAxOS45NzksLTAuNTdjMC44NzYsMC4wMTYgNC4xNDcsMC44NiA0LjA2MiwtMi42MjhjLTAuMTMyLC01LjQxIC0yLjI1NiwtOC45NyAtMi45MjgsLTEwLjA5Yy0zLjczMywtNi4yMiAtMjEuNzM1LC0xMi40NDIgLTM3LjI3MywtMi4xMDljLTIuMzkxLDEuNTkgLTMuMzExLC0wLjA3MyAtNS4yNDMsLTIuNDljLTIuNjQ2LC0zLjMxMSAtNC41MjQsLTQuNjE4IC0xLjk4MiwtNi43MTVjMTAuNzM3LC04Ljg2IDI1Ljk2OCwtOC4wNTQgMjkuMzc4LC03LjkwNGMxLjIyMSwwLjA1NCA3LjY1OSwwLjMzNiAxNC44NTcsMy41NzdjNy4wODIsMy4xODkgOS4xNzgsNi43NzQgOS42MTksNy4zNDhjMC45NDcsMS4yMzIgNS44NzgsNy42NDcgNi4yNDgsMTguMzkxYzAuMTAxLDIuOTI2IDAuMDkxLDQ0LjU3MiAwLjA3Myw0NC45NzljLTAuMDEsMC4yMjcgLTAuMDgzLDEuODUzIC0xLjc2MiwyLjIyMWMtMC40OTgsMC4xMDkgLTcuNDMxLDAuMTMzIC04LjA3OCwwLjA5N2MtMy43MTIsLTAuMjA3IC0yLjE0OCwtNS4wNTkgLTIuNTI5LC02LjUxNWMtMC4yOTcsLTEuMTM3IC0xLjM0NiwtMC45ODkgLTEuNDg2LC0wLjk2OWMtMC42MDgsMC4wODYgLTAuODgxLDAuOTYzIC0yLjc4OCwyLjQyMWMtMTAuOTQ3LDguMzY3IC0yOC4zODYsOC4zMTMgLTM3Ljk0OSwyLjM3OWMtOS4xOTEsLTUuNzA0IC05Ljg1OSwtMTQuMTYyIC05Ljk3NiwtMTUuNjQyYy0xLjg5MiwtMjMuOTU3IDI1LjgsLTI1LjUxOSAyNy43NzcsLTI1Ljc4MVptMS45MzUsMTAuNTUxYy00LjA3LDAuNTQxIC0xNy44NDEsMi4xMTQgLTE2Ljk2NiwxMy4yNTNjMC4wODksMS4xMjYgMC42MjYsNy45NjEgMTAuMDE4LDkuOTUzYzEwLjY5NCwyLjI2OCAyMi44MjgsLTEuODg4IDI3LjMzNCwtMTEuODA3YzEuMTQsLTIuNTA5IDEuODQzLC00LjA3NSAxLjg0MSwtOS4xNTFjLTAuMDAxLC0zLjM0NCAtMi4xMTMsLTIuNzE3IC04LjE4OSwtMi43NTRjLTcuMzg4LC0wLjA0NSAtOC45NTIsLTAuMTQ3IC0xNC4wMzcsMC41MDdaIiBzdHlsZT0iZmlsbDojRkZGRkZGOyIvPjxwYXRoIGQ9Ik0xOTYuNTEyLDExMi4zOTZjLTAuNjUxLC0wLjA5OSAtMS4zMTQsLTAuMTA4IC0xLjk2NSwtMC4yMDdjLTEuMjY3LC0wLjE5MiAtOC4xMjQsLTEuMjI5IC0xNC44ODcsLTUuOTIxYy0yMi44MTEsLTE1LjgyMyAtMTkuMDcyLC00NS44NzIgLTguMzMyLC01OC45MDhjMC43OTcsLTAuOTY4IDUuNDQsLTYuNjAzIDEyLjE0OSwtOS45MDVjMTUuMTUzLC03LjQ1NyAyNy44OTksLTIuNzQ4IDMwLjA1MSwtMi4wMzRjMTAuMDA0LDMuMzIyIDE1LjcwMiwxMC45MjcgMTUuODA1LDExLjE0N2MwLjc2NSwxLjYzNyAtMS4yNTksMi41MDggLTUuOTY1LDYuNzcyYy0yLjcxMiwyLjQ1OCAtMy4yOSwxLjQ5NiAtNS4yNTMsLTAuNDAxYy0xMS41MjksLTExLjE0MSAtMjQuOTM3LC03LjA4MSAtMjguODI1LC00LjgyN2MtMi40MDYsMS4zOTUgLTMuOTg3LDIuMDQ4IC03LjY0Nyw2LjQ5NmMtNi41Miw3LjkyNSAtNi4zOTMsMTkuMzU1IC01Ljc2OCwyMi44NDFjMS4zODgsNy43NDcgNC4yMjYsMTMuMzc2IDkuNzM5LDE3LjkxOGM4LjcwMiw3LjE2OSAyMS42NjgsNy40ODcgMzAuNjc4LC0wLjExM2M0LjE0MiwtMy40OTQgNC40NzcsLTUuNDA1IDcuMzkxLC0yLjk4NWM0LjY4MiwzLjg4OCA2LjQzOCw1LjE3OSA2LjUwNiw2LjI3NGMwLjAwNywwLjExMiAwLjYyNCwxLjA5OSAtNC4zODYsNS4zNjFjLTEyLjMxLDEwLjQ3MyAtMjYuNTA2LDguNjcgLTI5LjI5LDguNDkzWiIgc3R5bGU9ImZpbGw6I0ZGRkZGRjsiLz48cGF0aCBkPSJNMzUwLjY5NSw2Ny4zODZjLTAuOTYsLTEuNTMgLTAuOTE1LC0xLjUzMyAtMS45NjUsLTMuMDIzYy0wLjEyMSwtMC4xNzEgLTEuMjU4LC0xLjc4NSAtMC4wODEsLTIuNjE4YzAuNjU1LC0wLjQ2MyA2LjkyLC0wLjQwMiA4Ljc2OSwwLjEyN2M2LjQ0OCwxLjg0NSA1LjU2NSwzLjQ2MSA5LjQxNiw5LjQyMWMyLjU2NiwzLjk3MSA0LjUwNCw3LjQzMiA0Ljg3Myw4LjA5MWMzLjEyNSw1LjU4MSA0LjQ5NSw3LjUxMSA3LjQyNiwxMi4zMzhjMy4yMTQsNS4yOTQgNC45MTcsOC45MTUgOC40LDkuNjE2YzUuMjc0LDEuMDYxIDguNTE2LC02LjY1IDguNzIsLTYuOTc5YzEuMTQ3LC0xLjg0OCA3LjYyMSwtMTMuNDQxIDcuOTcyLC0xNC4wMTZjMi4zMTksLTMuNzk5IDkuMTMzLC0xNi41ODIgMTAuMDE2LC0xNy45OTZjMC40NywtMC43NTMgOC4wODEsLTEzLjg1IDkuODYsLTE3LjA3NWMxLjk4NiwtMy42IDQuMDY1LC05LjAyNCAxMS40NiwtMTAuNDEzYzIuNjI1LC0wLjQ5MyA3Ljg2MywwLjIyIDguMTU1LDEuNTUyYzAuMjksMS4zMjQgLTAuMDYyLDEuMzAxIC0wLjk5NywyLjI4M2MtMi4xNywyLjI3OCAtNi40NDQsMTAuMzYyIC02LjU4NywxMC41OTZjLTQuODUxLDcuOTI1IC0yNC45ODMsNDMuMjA1IC0yNy40NDEsNDcuMzJjLTEuOTUsMy4yNjMgLTEuODUyLDMuMjk3IC0zLjY4NCw2LjYzMmMtMy4wNzgsNS42MDMgLTkuNTcsOC42MjUgLTE0LjUyOCw4Ljk2OWMtMTQuMDYzLDAuOTc2IC0xOC4wNSwtOC42IC0yMC40MTcsLTEyLjQzOWMtMy4yMDcsLTUuMiAtOS4zODYsLTE1LjczMSAtMTEuODg1LC0yMC4wOTFjLTIuMzUxLC00LjEwMyAtNS41NDYsLTguOTM3IC03LjQ3OSwtMTIuMjk0WiIgc3R5bGU9ImZpbGw6I0ZGRkZGRjsiLz48cGF0aCBkPSJNNDcuNDg1LDQ1Ljc5NmMtMC4zMjksLTAuMDAxIC0wLjY1OCwtMC4wMTYgLTAuOTg3LC0wLjAxN2MtMS4xNTMsLTAuMDAyIC04LjI5OSwtMC4wMTQgLTEzLjM3MSw1LjM3OWMtNi44OTIsNy4zMjkgLTYuMzAzLDE3LjkxOCAtNi4zMDYsMjAuMzQzYy0wLjAxOSwxOC4wMTUgMC4xMzQsMTcuOTk4IDAuMTE5LDM1Ljk5OGMtMC4wMDMsMy4xNTggLTAuNzgxLDMuMjg0IC0zLjQ0NiwzLjI1OGMtNi4yMzgsLTAuMDU5IC03LjYxNywwLjE5IC04LjQ2MiwtMC43NjljLTAuNjA5LC0wLjY5MSAtMC43NzEsLTAuODc1IC0wLjc5NiwtMTEuNDg3Yy0wLjA5NSwtMzkuOTEyIDAuMDIzLC01MS41MjMgMC4wNjksLTU2LjAwM2MwLjA0NCwtNC4zNCAtMC43MTEsLTYuMjc4IDMuMTk1LC02LjI2M2M4LjA1NCwwLjAyOSA4Ljk1NiwtMC4yMTkgOS4zNDIsMi4yMDVjMC4yNjMsMS42NTEgLTAuMDE0LDEuOSAwLjY0LDIuMDg5YzEuMjM0LDAuMzU3IDEuMjk3LDAuMTggMi4yMzUsLTAuNzAxYzEwLjgwNSwtMTAuMTU3IDI4LjE4MiwtNi4xMjYgMzMuNjIyLC0yLjEwNmMwLjE4NSwwLjEzNyAxLjYzNywxLjIxIDAuOTcxLDIuNzA2Yy0wLjE5MywwLjQzNCAtNC41Myw3Ljc2MyAtNC44MzQsOC4wNDljLTIuMzAzLDIuMTcgLTIuOSwtMi4wMDkgLTExLjk4OSwtMi42NzlaIiBzdHlsZT0iZmlsbDojRkZGRkZGOyIvPjxwYXRoIGQ9Ik0zMTIuNDY2LDQ5LjU0MmMtMTUuNjMzLC0xMy4xOTQgLTMzLjMzOCwtNS43OTMgLTQwLjQ2NSwxLjUyMWMtMTEuMDU5LDExLjM0OSAtNy42MiwyNC42MTcgLTguMjU3LDI2LjUzM2MtMC42MzEsMS44OTkgLTYuMTEyLDMuNTI2IC05LjQ0OSw1LjUyNGMtMi40OTQsMS40OTMgLTIuNzk3LDAuMTU2IC0zLjQxMiwtMi42OThjLTEuMiwtNS41NjggLTAuNTMyLC0xMS4yOTggLTAuMjczLC0xMy45MTJjMS4yMjQsLTEyLjM3MiA4LjY5MiwtMjMuMDUxIDE2LjI3OCwtMjguNTQ1YzAuNjU2LC0wLjQ3NSA0Ljk3OSwtMy42MDYgOC44MTQsLTQuOTkxYzguMDM4LC0yLjkwNCAxMy4xNDMsLTMuODM2IDIwLjc3OSwtMy4yNDRjMS4yODksMC4xIDkuMDMsMC4xODMgMTkuMDQxLDUuNzNjMi43NTMsMS41MjYgNy44NzcsNS43NDIgMTAuMDcxLDcuOTM4YzMuMDkyLDMuMDk0IDQuMzU0LDQuODI4IDAuOTQ0LDYuMTgyYy01LjM3LDIuMTMzIC04LjAwNCw0LjUxNSAtOS45OTgsMy44MzJjLTAuNzM0LC0wLjI1MSAtMC42MzksLTAuNzg1IC00LjA3MywtMy44NzFaIiBzdHlsZT0iZmlsbDojRkZGRkZGOyIvPjxwYXRoIGQ9Ik0yODkuNDQyLDEwMS45MjhjNC40NjcsMC40NDIgMTAuMTA1LDAuODgxIDE4Ljc4OCwtMy44ODhjMi44MTUsLTEuNTQ2IDguMjk4LC02LjA4MiAxMS4xMTYsLTExLjYxNmM0LjU3NywtOC45ODkgMi43NzcsLTE1LjgxOCAzLjczNywtMTcuMTUxYzEuMTk1LC0xLjY2IDIuOTg1LC0xLjU2NyA4LjYwMiwtNC4zNTljMS42NjksLTAuODMgMy4zNTYsLTEuMzI3IDMuNTczLDEuNjE5YzAuMzc2LDUuMTE1IDEuNjc4LDE1LjE1MiAtNS4wNDIsMjYuODAxYy05LjYyOCwxNi42OTEgLTI0LjE1NiwxOS42NzkgLTI4LjYxNywyMC42MzZjLTIuMzY2LDAuNTA4IC0xMi4yMiwyLjg2IC0yNS45ODUsLTIuNzVjLTcuOTU5LC0zLjI0NCAtMTUuMDY3LC0xMC43OTQgLTE1LjIyOCwtMTEuNjg4Yy0wLjMxMSwtMS43MzIgMC4zNjksLTEuNTU2IDEuOTI5LC0yLjM3MWMwLjUwOSwtMC4yNjYgNC44MTQsLTIuNTE1IDYuMzQ3LC0zLjM2NGM0LjM5NywtMi40MzYgMy41ODMsMi4yNjMgMTMuODk5LDYuNTNjMi43NDksMS4xMzcgNi4zMTksMS41MzcgNi44ODEsMS42WiIgc3R5bGU9ImZpbGw6I0ZGRkZGRjsiLz48cGF0aCBkPSJNMjk5LjY2MSw4NC44MDVjLTAuMjQ5LDAuMTA3IC0zLjc2LDIuMjkxIC05LjExMywxLjQzOGMtNy4yMjgsLTEuMTUxIC0xNS4xMjgsLTEwLjYxOCAtOC42MjcsLTIxLjQ2NmMzLjc5NiwtNi4zMzUgMTYuMTEyLC05LjUxNiAyMi44MiwwLjU3NmMyLjI1NywzLjM5NiAzLjEzNywxMC4wMTEgLTAuMzc5LDE1LjA1MmMtMi40MywzLjQ4NCAtNC40MTgsNC4yMTMgLTQuNyw0LjM5OVoiIHN0eWxlPSJmaWxsOiNmMjVjMTM7Ii8+PC9nPjwvc3ZnPg==";

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

	// Nomes legíveis dos eventos (PT-BR) para a tabela.
	const EVENT_LABELS: Record<string, string> = {
		search_performed: "Busca realizada",
		search_zero_results: "Busca sem resultado",
		search_low_relevance: "Baixa relevância",
		recova_exposed: "Recova exibida",
		recova_product_viewed: "Produto visto",
		recova_product_clicked: "Produto clicado",
		recova_refinement_started: "Refinamento iniciado",
		recova_reengaged: "Reengajamento",
		recova_closed: "Overlay fechado",
		purchase_attributed: "Compra atribuída",
		checkout_started: "Checkout iniciado",
	};

	return (
		<div className="min-h-dvh p-6">
			<div className="mx-auto max-w-4xl space-y-5">
				<Card className="border-0 shadow-md">
					<CardHeader className="bg-[#102A43] text-white rounded-t-xl flex flex-row items-center gap-3">
						<img src={RECOVA_LOGO} alt="Recova" className="h-8 w-auto" />
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

				<div>
					<h2 className="mb-2 text-sm font-semibold text-[#102A43] font-display">
						Visão geral
					</h2>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<MetricCard label="Buscas" value={totals.searches} />
						<MetricCard
							label="Zero resultados"
							value={totals.zero_results}
							accent="orange"
						/>
						<MetricCard label="Exposições" value={totals.exposed} />
						<MetricCard
							label="Compras atribuídas"
							value={totals.purchases}
							accent="green"
						/>
					</div>
				</div>

				<div>
					<h2 className="mb-2 text-sm font-semibold text-[#102A43] font-display">
						Desempenho
					</h2>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						<MetricCard
							label="Taxa de zero resultados"
							value={metrics.zero_results_rate}
							suffix="%"
							accent="orange"
						/>
						<MetricCard
							label="Taxa de recuperação"
							value={metrics.recovery_rate}
							suffix="%"
							accent="green"
						/>
						<MetricCard
							label="Receita atribuída"
							value={`R$ ${metrics.attributed_revenue.toLocaleString("pt-BR")}`}
							accent="blue"
						/>
						<MetricCard
							label="Receita por busca falha"
							value={`R$ ${metrics.revenue_per_failed_search.toLocaleString("pt-BR")}`}
							accent="blue"
						/>
						<MetricCard
							label="CTR das alternativas"
							value={metrics.click_through_rate}
							suffix="%"
						/>
						<MetricCard
							label="Taxa de refinamento"
							value={metrics.refinement_rate}
							suffix="%"
						/>
						<MetricCard
							label="Produtos por usuário"
							value={metrics.products_per_user}
						/>
						<MetricCard
							label="Checkout iniciado"
							value={metrics.checkout_rate}
							suffix="%"
							accent="green"
						/>
					</div>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-base font-display">
							Eventos recentes
						</CardTitle>
					</CardHeader>
					<CardContent>
						{result.recent.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Nenhum evento ainda. Faça uma busca com zero resultados para
								gerar dados reais.
							</p>
						) : (
							<div className="overflow-x-auto rounded-lg border">
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b bg-muted/50 text-left">
											<th className="p-2 font-medium">Evento</th>
											<th className="p-2 font-medium">Quando</th>
											<th className="p-2 font-medium">Sessão</th>
										</tr>
									</thead>
									<tbody>
										{result.recent.map((e) => {
											const ts = new Date(String(e.timestamp));
											const ago = Math.max(
												0,
												Math.round((Date.now() - ts.getTime()) / 1000),
											);
											const when =
												ago < 60
													? `${ago}s atrás`
													: ago < 3600
														? `${Math.round(ago / 60)}min atrás`
														: ts.toLocaleString("pt-BR");
											return (
												<tr
													key={`${e.event}:${e.timestamp}:${e.session_id ?? ""}`}
													className="border-b last:border-0"
												>
													<td className="p-2">
														<Badge variant="secondary">
															{EVENT_LABELS[String(e.event)] ?? String(e.event)}
														</Badge>
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
