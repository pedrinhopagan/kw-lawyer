import { arktypeResolver } from "@hookform/resolvers/arktype";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type } from "arktype";
import { ArrowRightIcon, LoaderCircleIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { orpc } from "@/lib/orpc";
import { OAB_UFS } from "./oab-ufs";

const loginSchema = type({
	oabNumber: type(/^\d{2,10}$/u).configure({
		message: "Informe apenas os números da sua inscrição na OAB.",
	}),
	oabUf: type(/^[A-Z]{2}$/u).configure({ message: "Escolha a UF da sua OAB." }),
	"name?": "string",
});

function needsName(error: unknown) {
	return error instanceof ORPCError && error.code === "NOT_FOUND";
}

export function LoginForm({ redirectTo }: { redirectTo: string }) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const form = useForm({
		resolver: arktypeResolver(loginSchema),
		defaultValues: { oabNumber: "", oabUf: "", name: "" },
	});

	const login = useMutation(
		orpc.auth.login.mutationOptions({
			onSuccess: async ({ lawyer }) => {
				// A tela de entrada também é por onde se acrescenta a segunda OAB, então o cache pode
				// estar cheio do advogado anterior. Ele sai inteiro antes de a nova sessão assumir.
				queryClient.clear();
				queryClient.setQueryData(orpc.auth.me.queryKey(), { lawyer });
				await navigate({ href: redirectTo });
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const askName = needsName(login.error);

	return (
		<Form {...form}>
			<form
				className="flex flex-col gap-4"
				onSubmit={form.handleSubmit(({ name, ...values }) =>
					login.mutate(name?.trim() ? { ...values, name: name.trim() } : values),
				)}
			>
				<div className="grid grid-cols-[1fr_6.25rem] items-start gap-2.5">
					<FormField
						control={form.control}
						name="oabNumber"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
									Número da OAB
								</FormLabel>
								<FormControl>
									<Input
										{...field}
										autoFocus
										inputMode="numeric"
										autoComplete="off"
										placeholder="apenas números"
										className="font-mono tracking-tight tabular-nums"
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="oabUf"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
									UF
								</FormLabel>
								<Select value={field.value} onValueChange={field.onChange}>
									<FormControl>
										<SelectTrigger className="w-full font-mono [&_[data-uf-name]]:hidden">
											<SelectValue placeholder="UF" />
										</SelectTrigger>
									</FormControl>
									<SelectContent className="max-h-72">
										{OAB_UFS.map((option) => (
											<SelectItem key={option.uf} value={option.uf}>
												<span className="font-mono text-xs">{option.uf}</span>
												<span data-uf-name className="text-muted-foreground">
													{option.name}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				{login.isError && !askName && (
					<p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive">
						{login.error.message}
					</p>
				)}

				{askName && (
					<div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 px-3 py-3">
						<p className="text-xs leading-relaxed text-muted-foreground">
							Nenhuma publicação saiu nesta OAB até agora. Isso acontece com inscrição recente,
							processo que corre em papel ou intimação que sai no nome de outro advogado do
							escritório. Você pode entrar assim mesmo: o painel enche sozinho quando a primeira
							publicação chegar.
						</p>

						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
										Seu nome completo
									</FormLabel>
									<FormControl>
										<Input {...field} autoFocus autoComplete="name" />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
				)}

				<Button type="submit" disabled={login.isPending} className="w-full">
					{login.isPending && <LoaderCircleIcon className="animate-spin" />}
					{login.isPending && "Procurando suas publicações"}
					{!login.isPending && (askName ? "Entrar assim mesmo" : "Entrar")}
					{!login.isPending && <ArrowRightIcon />}
				</Button>
			</form>
		</Form>
	);
}
