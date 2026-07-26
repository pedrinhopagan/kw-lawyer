export const SPECIES_LABELS = {
	despacho: "Despacho",
	interlocutoria: "Decisão interlocutória",
	sentenca: "Sentença",
	acordao: "Acórdão",
	monocratica: "Decisão monocrática",
} as const;

export const SPECIES_SHORT = {
	despacho: "Despacho",
	interlocutoria: "Interlocutória",
	sentenca: "Sentença",
	acordao: "Acórdão",
	monocratica: "Monocrática",
} as const;

// A espécie é o que escolhe o recurso, o prazo e o preparo, e o motor a lê de código de movimento, do
// texto ou do cabeçalho. Mostrá-la sempre do mesmo jeito seria dar a leitura como fato: o selo diz de
// onde ela veio.
export const SPECIES_READING_LABELS = {
	alta: null,
	media: "espécie sem confirmação",
	baixa: "espécie deduzida do texto",
} as const;

export const OUTCOME_LABELS = {
	procedente: "Procedente",
	improcedente: "Improcedente",
	parcialmente_procedente: "Parcialmente procedente",
	extincao_sem_merito: "Extinção sem mérito",
	extincao_execucao: "Extinção da execução",
	homologacao: "Homologação",
	tutela_deferida: "Tutela deferida",
	tutela_indeferida: "Tutela indeferida",
	recurso_provido: "Recurso provido",
	recurso_desprovido: "Recurso desprovido",
	embargos_acolhidos: "Embargos acolhidos",
	embargos_rejeitados: "Embargos rejeitados",
} as const;

export const EFFECT_LABELS = {
	encerra_fase: "Encerra a fase",
	resolve_incidente: "Resolve incidente",
	abre_prazo: "Abre prazo",
	condena_verba: "Condena em verba",
} as const;

export const EVIDENCE_KIND_LABELS = {
	documental: "Documental",
	pericial: "Pericial",
	testemunhal: "Testemunhal",
	depoimento: "Depoimento pessoal",
	inspecao: "Inspeção judicial",
	emprestada: "Prova emprestada",
} as const;

export const EVIDENCE_STAGE_LABELS = {
	juntada: "Juntada aos autos",
	deferida: "Produção deferida",
	indeferida: "Produção indeferida",
	manifestacao_aberta: "Aguarda manifestação",
} as const;

export const EVIDENCE_PRODUCER_LABELS = {
	autor: "Polo ativo",
	reu: "Polo passivo",
	oficio: "De ofício",
	indefinido: "Origem não identificada",
} as const;

export const RELATION_KIND_LABELS = {
	agravo_instrumento: "Agravo de instrumento",
	agravo_interno: "Agravo interno",
	agravo_execucao_penal: "Agravo em execução penal",
	embargos_declaracao: "Embargos de declaração",
	recurso: "Recurso",
	cumprimento_sentenca: "Cumprimento de sentença",
	execucao: "Execução",
	precatoria: "Carta precatória",
	desconsideracao: "Desconsideração da personalidade",
	incidente: "Incidente",
} as const;

export const RELATION_STATE_LABELS = {
	distribuido: "Distribuído",
	com_relator: "Com o relator",
	liminar_deferida: "Liminar deferida",
	liminar_indeferida: "Liminar indeferida",
	julgado: "Julgado",
	baixado: "Baixado",
} as const;

export const APPEAL_CHOICE_LABELS = {
	recorrer: "Vai recorrer",
	nao_recorrer: "Não vai recorrer",
	recorrido: "Já recorrido",
} as const;

const GRAU_LABELS: Record<string, string> = {
	G1: "1º grau",
	G2: "2º grau",
	JE: "Juizado especial",
	TR: "Turma recursal",
	SUP: "Instância superior",
};

export function grauLabel(grau: string | null | undefined) {
	if (!grau) {
		return null;
	}

	return GRAU_LABELS[grau] ?? grau;
}

const POLO_LABELS: Record<string, string> = { A: "Polo ativo", P: "Polo passivo" };

export function poloLabel(polo: string | null) {
	if (!polo) {
		return "Parte";
	}

	return POLO_LABELS[polo] ?? `Polo ${polo}`;
}

export function countLabel(count: number, singular: string, plural: string) {
	if (count === 1) {
		return `1 ${singular}`;
	}

	return `${count.toLocaleString("pt-BR")} ${plural}`;
}
