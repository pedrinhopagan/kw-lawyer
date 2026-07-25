import { arktypeResolver } from "@hookform/resolvers/arktype";
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
import { orpc } from "@/lib/orpc";

const accessSchema = type({
	user: type("string > 0").configure({ message: "Informe o usuário." }),
	password: type("string > 0").configure({ message: "Informe a senha." }),
});

export function AccessForm({ redirectTo }: { redirectTo: string }) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const form = useForm({
		resolver: arktypeResolver(accessSchema),
		defaultValues: { user: "", password: "" },
	});

	const enter = useMutation(
		orpc.access.login.mutationOptions({
			onSuccess: async () => {
				queryClient.setQueryData(orpc.access.status.queryKey(), { granted: true });
				await navigate({ href: redirectTo });
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	return (
		<Form {...form}>
			<form
				className="flex flex-col gap-4"
				onSubmit={form.handleSubmit((values) => enter.mutate(values))}
			>
				<FormField
					control={form.control}
					name="user"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
								Usuário
							</FormLabel>
							<FormControl>
								<Input {...field} autoFocus autoComplete="username" className="font-mono" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="password"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
								Senha
							</FormLabel>
							<FormControl>
								<Input
									{...field}
									type="password"
									autoComplete="current-password"
									className="font-mono"
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				{enter.isError && (
					<p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive">
						{enter.error.message}
					</p>
				)}

				<Button type="submit" disabled={enter.isPending} className="w-full">
					{enter.isPending && <LoaderCircleIcon className="animate-spin" />}
					{enter.isPending && "Conferindo"}
					{!enter.isPending && "Entrar"}
					{!enter.isPending && <ArrowRightIcon />}
				</Button>
			</form>
		</Form>
	);
}
