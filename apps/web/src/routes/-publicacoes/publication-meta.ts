import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PublicationItem } from "./queries";

type PublicationKind = Pick<PublicationItem, "communicationType" | "documentType">;

export function publicationTitle(publication: PublicationKind) {
	const communication = publication.communicationType?.trim();
	const document = publication.documentType?.trim();

	if (!communication) {
		return document || "Publicação";
	}

	if (!document) {
		return communication;
	}

	if (document.localeCompare(communication, "pt-BR", { sensitivity: "accent" }) === 0) {
		return communication;
	}

	return `${communication} / ${document}`;
}

export function fullDate(availableAt: string) {
	const date = parseISO(availableAt);

	return format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function shortDate(availableAt: string) {
	const date = parseISO(availableAt);

	return format(date, "d MMM yy", { locale: ptBR });
}
