import { BanIcon } from "lucide-react";
import { CANCELED_PUBLICATION_LABEL } from "@/lib/deadline-meta";

export function CanceledPublicationMark() {
	return (
		<span className="flex shrink-0 items-center gap-1 rounded-full border border-destructive/35 bg-destructive/10 px-1.5 text-2xs font-medium text-destructive">
			<BanIcon className="size-3" />
			{CANCELED_PUBLICATION_LABEL}
		</span>
	);
}
