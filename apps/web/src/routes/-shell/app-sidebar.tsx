import type { SessionLawyer } from "../-auth/session";
import { Brand } from "./brand";
import { LawyerMenu } from "./lawyer-menu";
import { NavItems } from "./nav";
import { SyncIndicator } from "./sync-indicator";

export function AppSidebar({
	lawyer,
	onNavigate,
}: {
	lawyer: SessionLawyer;
	onNavigate?: () => void;
}) {
	return (
		<div className="flex h-full flex-col bg-sidebar">
			<div className="px-3 py-3.5">
				<Brand />
			</div>

			<NavItems onNavigate={onNavigate} />

			<div className="flex-1" />

			<SyncIndicator />

			<div className="border-t border-sidebar-border p-2">
				<LawyerMenu lawyer={lawyer} />
			</div>
		</div>
	);
}
