const STEPS = [
	{
		title: "Chega a publicação",
		body: "O DJEN é varrido pela inscrição da OAB. Cada comunicação entra na caixa com tribunal, órgão e teor completo, e o mesmo ato publicado para vários destinatários entra uma vez só.",
	},
	{
		title: "O processo ganha história",
		body: "O DataJud completa o processo com classe, assunto, órgão julgador e a linha de movimentos, para que a publicação não fique solta no tempo.",
	},
	{
		title: "O prazo é contado",
		body: "A regra de contagem lê o ato, escolhe o termo inicial e conta em dias úteis pelo calendário forense do tribunal, separando o que é prazo seu do que é prazo de perito, contador ou serventia.",
	},
	{
		title: "Vira ação",
		body: "O material do processo se divide em provas, decisões, o que é recorrível e os incidentes, cada peça com link para o documento original.",
	},
];

export function LandingEsteira() {
	return (
		<section className="border-b border-border">
			<div className="mx-auto w-full max-w-6xl px-5 py-20">
				<span className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">
					da publicação até a ação
				</span>

				<h2 className="mt-4 max-w-[22ch] text-3xl font-semibold leading-tight tracking-[-0.03em]">
					Quatro passos que você não precisa mais fazer à mão
				</h2>

				<ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
					{STEPS.map((step, index) => (
						<li key={step.title} className="flex flex-col gap-3 bg-card p-6">
							<span className="font-mono text-2xs tabular-nums tracking-[0.18em] text-primary">
								{String(index + 1).padStart(2, "0")}
							</span>
							<h3 className="text-sm font-semibold tracking-[-0.01em]">{step.title}</h3>
							<p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
