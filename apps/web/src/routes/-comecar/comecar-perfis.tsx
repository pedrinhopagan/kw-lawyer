import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatOab, formatPersonName } from "@/lib/format";
import { profilesQueryOptions, useLogout, useSwitchProfile } from "../-auth/session";

const LINK_CLASS =
	"rounded-sm underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground disabled:pointer-events-none disabled:opacity-60";

// Quem chega aqui é um advogado que ainda não baixou nada, e a carga leva minutos. Sem esta saída,
// entrar com a OAB do sócio prenderia a aba nesta tela: o painel que já estava pronto ficaria
// inalcançável até a sincronização do recém-chegado terminar.
export function ComecarPerfis() {
	const profiles = useQuery(profilesQueryOptions);
	const switchProfile = useSwitchProfile();
	const logout = useLogout();
	const others = (profiles.data?.profiles ?? []).filter((profile) => !profile.active);
	const busy = switchProfile.isPending || logout.isPending;

	return (
		<div className="flex flex-col gap-2 px-1 text-2xs leading-relaxed text-muted-foreground">
			{others.map((profile) => (
				<p key={profile.id}>
					<button
						type="button"
						disabled={busy}
						className={LINK_CLASS}
						onClick={() => switchProfile.mutate(profile.id)}
					>
						Voltar para {formatPersonName(profile.name)}
					</button>{" "}
					<span className="font-mono">{formatOab(profile)}</span>, que já está com o painel pronto
					neste navegador.
				</p>
			))}

			<p>
				<Link to="/login" search={{}} className={LINK_CLASS}>
					Entrar com outra OAB
				</Link>{" "}
				ou{" "}
				<button
					type="button"
					disabled={busy}
					className={LINK_CLASS}
					onClick={() => logout.mutate()}
				>
					sair desta
				</button>
				.
			</p>
		</div>
	);
}
