const NOTES = [
	{
		term: "calendário forense",
		body: "Feriado nacional, feriado do tribunal e suspensão de expediente entram na conta antes de o prazo virar data.",
	},
	{
		term: "prazo de quem",
		body: "Prazo de perito, contador ou serventia aparece separado: o que não é seu não disputa espaço com o que é.",
	},
	{
		term: "google agenda",
		body: "O recorte escolhido vai para o seu calendário, com o link de volta para o prazo dentro do painel.",
	},
];

export function LandingAgenda() {
	return (
		<section className="border-b border-border">
			<div className="mx-auto w-full max-w-6xl px-5 py-20">
				<div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-16">
					<div>
						<span className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">
							agenda
						</span>

						<h2 className="mt-4 max-w-[20ch] text-3xl font-semibold leading-tight tracking-[-0.03em]">
							Prazo com rastro, não prazo por adivinhação
						</h2>

						<p className="mt-4 max-w-[54ch] text-sm leading-relaxed text-muted-foreground">
							Cada prazo diz de qual publicação nasceu, por qual regra foi contado e com que
							confiança. Quando o texto não é claro o suficiente, ele chega marcado para conferência
							em vez de virar uma data falsamente segura.
						</p>
					</div>

					<dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
						{NOTES.map((note) => (
							<div key={note.term} className="px-5 py-4">
								<dt className="font-mono text-2xs uppercase tracking-[0.16em] text-primary">
									{note.term}
								</dt>
								<dd className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
									{note.body}
								</dd>
							</div>
						))}
					</dl>
				</div>
			</div>
		</section>
	);
}
