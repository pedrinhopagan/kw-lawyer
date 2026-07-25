import { arktypeResolver } from "@hookform/resolvers/arktype";
import { type } from "arktype";
import { LoaderCircleIcon, PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
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
import { OAB_UFS } from "../-auth/oab-ufs";
import { useAddOab } from "./queries";

const oabSchema = type({
	oabNumber: type(/^\d{2,10}$/u).configure({
		message: "Informe apenas os números da inscrição.",
	}),
	oabUf: type(/^[A-Z]{2}$/u).configure({ message: "Escolha a UF." }),
});

export function OabForm() {
	const add = useAddOab();

	const form = useForm({
		resolver: arktypeResolver(oabSchema),
		defaultValues: { oabNumber: "", oabUf: "" },
	});

	return (
		<Form {...form}>
			<form
				className="flex flex-col gap-3 sm:flex-row sm:items-end"
				onSubmit={form.handleSubmit((values) =>
					add.mutate(values, { onSuccess: () => form.reset() }),
				)}
			>
				<FormField
					control={form.control}
					name="oabNumber"
					render={({ field }) => (
						<FormItem className="flex-1">
							<FormLabel className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
								Número da OAB
							</FormLabel>
							<FormControl>
								<Input
									{...field}
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
						<FormItem className="w-full sm:w-[6.25rem]">
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

				<Button type="submit" disabled={add.isPending} className="gap-2">
					{add.isPending && <LoaderCircleIcon className="animate-spin" />}
					{!add.isPending && <PlusIcon />}
					Acompanhar
				</Button>
			</form>
		</Form>
	);
}
