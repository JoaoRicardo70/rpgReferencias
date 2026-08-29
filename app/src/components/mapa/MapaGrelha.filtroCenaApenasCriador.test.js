import { describe, it, expect } from 'vitest';

// ==========================================================================
// NOTA DE ESCOPO:
// `MapaGrelha.jsx` importa `Tabuleiro3D.jsx`, que por sua vez importa
// `@react-three/fiber`/`@react-three/drei`/`three`. Verificado manualmente
// antes de escrever este arquivo: um `import('./MapaGrelha.jsx')` sozinho,
// dentro do Vitest + jsdom deste projeto, já trava por ~20s tentando montar o
// motor 3D (nem chega a haver JSX renderizado — só o import estático já é
// pesado o suficiente) e estoura o timeout padrão do teste. Por isso, ao
// contrário de `MapaFormContext.apenasCriador.test.jsx` (que monta o
// `MapaMestreGerenciadorCenas` REAL dentro de um `MapaFormProvider` REAL, já
// que aquele arquivo não importa nada de 3D), aqui isolamos apenas a
// expressão de filtragem usada no `<select>` de `MapaControlesSuperiores`:
//
//   Object.entries(cenario?.lista || {})
//       .filter(([id, c]) => !c.apenasCriador || souCriador || cenaAtivaIdGlobal === id)
//
// — copiada fielmente de MapaGrelha.jsx:66 (dentro de `MapaControlesSuperiores`).
// Qualquer alteração feita à expressão real deve ser replicada aqui.
//
// Cobertura: só a LÓGICA de filtragem do dropdown "Cena:" (o mesmo predicado
// já usado em `MapaFerramentasMestre.jsx:90`, testado via integração real no
// arquivo irmão). Não cobre o `<select>`/JSX de fato renderizado.
// ==========================================================================

function filtrarCenasVisiveis(lista, souCriador, cenaAtivaIdGlobal) {
    return Object.entries(lista || {}).filter(
        ([id, c]) => !c.apenasCriador || souCriador || cenaAtivaIdGlobal === id
    );
}

describe('MapaGrelha - MapaControlesSuperiores: filtro do dropdown "Cena:" por apenasCriador (MapaGrelha.jsx:66)', () => {
    const lista = {
        'cena-publica': { nome: 'Praça Pública' },
        'cena-secreta': { nome: 'Covil Secreto', apenasCriador: true },
    };

    it('Happy Path: souCriador vê as duas cenas (pública e apenasCriador)', () => {
        const resultado = filtrarCenasVisiveis(lista, true, 'cena-publica');
        const ids = resultado.map(([id]) => id);
        expect(ids).toEqual(['cena-publica', 'cena-secreta']);
    });

    it('Edge Case: quem NÃO é souCriador só vê a cena pública enquanto a secreta não for a ativa', () => {
        const resultado = filtrarCenasVisiveis(lista, false, 'cena-publica');
        const ids = resultado.map(([id]) => id);
        expect(ids).toEqual(['cena-publica']);
    });

    it('Edge Case: quando a cena "apenasCriador" vira a cenaAtivaIdGlobal, ela aparece mesmo para quem não é souCriador', () => {
        const resultado = filtrarCenasVisiveis(lista, false, 'cena-secreta');
        const ids = resultado.map(([id]) => id);
        expect(ids).toEqual(['cena-publica', 'cena-secreta']);
    });

    it('Edge Case: lista vazia retorna array vazio, independente de souCriador', () => {
        expect(filtrarCenasVisiveis({}, true, 'default')).toEqual([]);
        expect(filtrarCenasVisiveis({}, false, 'default')).toEqual([]);
    });

    it('Edge Case: lista undefined (cenario ainda não carregado) não lança exceção e retorna vazio', () => {
        expect(() => filtrarCenasVisiveis(undefined, false, 'default')).not.toThrow();
        expect(filtrarCenasVisiveis(undefined, false, 'default')).toEqual([]);
    });

    it('Regressão: cena sem a propriedade apenasCriador nunca é filtrada, para ninguém', () => {
        const listaSoPublica = { 'cena-a': { nome: 'Cena A' }, 'cena-b': { nome: 'Cena B' } };
        expect(filtrarCenasVisiveis(listaSoPublica, true, 'cena-a').map(([id]) => id)).toEqual(['cena-a', 'cena-b']);
        expect(filtrarCenasVisiveis(listaSoPublica, false, 'cena-a').map(([id]) => id)).toEqual(['cena-a', 'cena-b']);
    });

    it('Regressão: múltiplas cenas apenasCriador — só a que é a cenaAtivaIdGlobal aparece pra quem não é souCriador', () => {
        const listaMultipla = {
            'cena-a': { nome: 'Cena A', apenasCriador: true },
            'cena-b': { nome: 'Cena B', apenasCriador: true },
            'cena-c': { nome: 'Cena C' },
        };
        const resultado = filtrarCenasVisiveis(listaMultipla, false, 'cena-b');
        expect(resultado.map(([id]) => id)).toEqual(['cena-b', 'cena-c']);
    });
});
