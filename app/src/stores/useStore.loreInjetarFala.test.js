import { describe, it, expect, beforeEach } from 'vitest';
import useStore from './useStore';

// ---------------------------------------------------------------------------
// QA — injetarFalaNoArcoAtivo (Registros Akáshicos / Oráculo <-> HUD do Mestre)
//
// Contexto: MapaSextaFeira (Web Speech API) e AIFormContext agora compartilham
// o mesmo store Zustand. injetarFalaNoArcoAtivo é a ponte que ambos usam para
// anexar uma linha de fala transcrita ao texto do arco atualmente ativo, sem
// passar por localStorage/CustomEvent.
//
// Segue o padrão de useStore.divisorPoderMesa.test.js: usa a API pública do
// store (useStore.getState()) diretamente, sem mockar nada. O store é um
// singleton entre os testes deste arquivo, então cada teste estabelece seu
// próprio estado conhecido via setters antes de agir.
// ---------------------------------------------------------------------------

function estabelecerCapituloArcoConhecido(textoInicial = '') {
    const capId = 111;
    const arcId = 222;
    useStore.getState().setLoreCapitulosPresente([
        { id: capId, titulo: 'Capítulo de Teste', arcos: [{ id: arcId, titulo: 'Arco de Teste', texto: textoInicial }], tierList: [] },
    ]);
    useStore.getState().setLoreCapituloAtivoId(capId);
    useStore.getState().setLoreArcoAtivoIdPresente(arcId);
    return { capId, arcId };
}

function getArcoAtivo() {
    const state = useStore.getState();
    const cap = state.loreCapitulosPresente.find((c) => c.id === state.loreCapituloAtivoId);
    return cap?.arcos?.find((a) => a.id === state.loreArcoAtivoIdPresente);
}

describe('useStore — injetarFalaNoArcoAtivo (lore/Registros Akáshicos)', () => {
    beforeEach(() => {
        // Estado limpo e conhecido antes de cada teste, evitando dependência de
        // ordem de execução ou de resíduos deixados por outros testes do store.
        estabelecerCapituloArcoConhecido('');
    });

    it('anexa a fala ao texto do arco ativo quando o arco já tem texto, com separador de nova linha', () => {
        estabelecerCapituloArcoConhecido('Texto original do arco.');

        useStore.getState().injetarFalaNoArcoAtivo('Nova fala transcrita.');

        expect(getArcoAtivo().texto).toBe('Texto original do arco.\nNova fala transcrita.');
    });

    it('NÃO adiciona quebra de linha inicial quando o arco ativo está vazio', () => {
        estabelecerCapituloArcoConhecido('');

        useStore.getState().injetarFalaNoArcoAtivo('Primeira fala.');

        expect(getArcoAtivo().texto).toBe('Primeira fala.');
        expect(getArcoAtivo().texto.startsWith('\n')).toBe(false);
    });

    it('chamadas repetidas anexam múltiplas linhas corretamente, cada uma em sua própria linha', () => {
        estabelecerCapituloArcoConhecido('');

        useStore.getState().injetarFalaNoArcoAtivo('Linha 1.');
        useStore.getState().injetarFalaNoArcoAtivo('Linha 2.');
        useStore.getState().injetarFalaNoArcoAtivo('Linha 3.');

        expect(getArcoAtivo().texto).toBe('Linha 1.\nLinha 2.\nLinha 3.');
    });

    it('trata um arco cujo texto é apenas espaços em branco como "vazio" (sem separador extra)', () => {
        estabelecerCapituloArcoConhecido('   ');

        useStore.getState().injetarFalaNoArcoAtivo('Fala depois de espaços.');

        // A implementação usa `arco.texto.trim()` para decidir o separador, então
        // um texto só-com-espaços não deve ganhar o '\n' de separação — porém os
        // espaços originais NÃO são removidos do texto (apenas concatenados).
        expect(getArcoAtivo().texto).toBe('   Fala depois de espaços.');
    });

    it('não lança erro e não muta nenhum capítulo/arco quando loreCapituloAtivoId não corresponde a nenhum capítulo existente', () => {
        estabelecerCapituloArcoConhecido('Texto preservado.');
        const snapshotAntes = JSON.parse(JSON.stringify(useStore.getState().loreCapitulosPresente));

        useStore.getState().setLoreCapituloAtivoId(999999);

        expect(() => useStore.getState().injetarFalaNoArcoAtivo('Fala perdida.')).not.toThrow();
        expect(useStore.getState().loreCapitulosPresente).toEqual(snapshotAntes);
    });

    it('não lança erro e não muta nenhum capítulo/arco quando loreArcoAtivoIdPresente não corresponde a nenhum arco existente', () => {
        const { capId } = estabelecerCapituloArcoConhecido('Texto preservado.');
        const snapshotAntes = JSON.parse(JSON.stringify(useStore.getState().loreCapitulosPresente));

        useStore.getState().setLoreCapituloAtivoId(capId);
        useStore.getState().setLoreArcoAtivoIdPresente(999999);

        expect(() => useStore.getState().injetarFalaNoArcoAtivo('Fala perdida.')).not.toThrow();
        expect(useStore.getState().loreCapitulosPresente).toEqual(snapshotAntes);
    });

    it('não lança erro quando loreCapitulosPresente está vazio', () => {
        useStore.getState().setLoreCapitulosPresente([]);
        useStore.getState().setLoreCapituloAtivoId(1);
        useStore.getState().setLoreArcoAtivoIdPresente(11);

        expect(() => useStore.getState().injetarFalaNoArcoAtivo('Fala no vazio.')).not.toThrow();
        expect(useStore.getState().loreCapitulosPresente).toEqual([]);
    });

    it('setLoreCapitulosPresente aceita um valor direto (convenção de setter estilo useState)', () => {
        const novaLista = [{ id: 1, titulo: 'X', arcos: [], tierList: [] }];
        useStore.getState().setLoreCapitulosPresente(novaLista);
        expect(useStore.getState().loreCapitulosPresente).toEqual(novaLista);
    });

    it('setLoreCapitulosPresente aceita um updater funcional (prev => novoValor), como o setter do useState', () => {
        useStore.getState().setLoreCapitulosPresente([{ id: 1, titulo: 'A', arcos: [], tierList: [] }]);

        useStore.getState().setLoreCapitulosPresente((prev) => [
            ...prev,
            { id: 2, titulo: 'B', arcos: [], tierList: [] },
        ]);

        expect(useStore.getState().loreCapitulosPresente.map((c) => c.id)).toEqual([1, 2]);
    });

    it('setLoreCapituloAtivoId aceita tanto valor direto quanto updater funcional', () => {
        useStore.getState().setLoreCapituloAtivoId(5);
        expect(useStore.getState().loreCapituloAtivoId).toBe(5);

        useStore.getState().setLoreCapituloAtivoId((prev) => prev + 1);
        expect(useStore.getState().loreCapituloAtivoId).toBe(6);
    });
});
