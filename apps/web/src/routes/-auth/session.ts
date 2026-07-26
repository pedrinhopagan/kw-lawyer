import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { orpc, orpcClient, type RouterOutputs } from "@/lib/orpc";
import { currentPushSubscription } from "../-configuracoes/push";

const SESSION_STALE_MS = 5 * 60 * 1000;

export type SessionLawyer = NonNullable<RouterOutputs["auth"]["me"]["lawyer"]>;
export type SessionProfile = RouterOutputs["auth"]["profiles"]["profiles"][number];

export const sessionQueryOptions = orpc.auth.me.queryOptions({ staleTime: SESSION_STALE_MS });

export const profilesQueryOptions = orpc.auth.profiles.queryOptions({
	staleTime: SESSION_STALE_MS,
});

// Trocar de advogado troca a identidade da aba inteira, e o destino quase sempre é a mesma rota em
// que ela já estava: navegar para onde já se está não remonta nada, e o painel anterior fica na tela
// com o dado do novo carregado por baixo. Recarregar é o único jeito de não sobrar estado de
// ninguém, e é o mesmo caminho que o app já usa quando o gate expira.
function assumir(lawyer: SessionLawyer) {
	if (lawyer.onboardingState === "pronto") {
		window.location.assign("/publicacoes");

		return;
	}

	window.location.assign("/comecar");
}

export function useSwitchProfile() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (lawyerId: string) => orpcClient.auth.switch({ lawyerId }),
		// A recarga já descarta tudo, mas ela não é instantânea: limpar antes evita que a tela ainda
		// pinte um quadro com a publicação do escritório anterior.
		onSuccess: ({ lawyer }) => {
			queryClient.clear();
			assumir(lawyer);
		},
		onError: () => {
			toast.error("Não foi possível trocar de advogado agora. Tente de novo.");
		},
	});
}

export function useLogout() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	return useMutation({
		mutationFn: async () => {
			// A assinatura de push é do par (advogado, aparelho). Sair sem apagá-la faria este celular
			// continuar recebendo alerta de prazo da OAB que acabou de sair.
			const subscription = await currentPushSubscription();
			const endpoint = subscription?.endpoint;
			const result = await orpcClient.auth.logout(endpoint ? { pushEndpoint: endpoint } : {});

			// Cancelar a inscrição no navegador derruba o push de todos os perfis daqui, então isso só
			// acontece quando ninguém mais depende dela.
			if (subscription && !result.endpointInUse) {
				await subscription.unsubscribe();
			}

			return result;
		},
		onSuccess: async ({ lawyer }) => {
			if (lawyer) {
				assumir(lawyer);

				return;
			}

			await navigate({ to: "/login" });
			queryClient.clear();
		},
		onError: () => {
			toast.error("Não foi possível encerrar a sessão agora. Tente de novo.");
		},
	});
}
