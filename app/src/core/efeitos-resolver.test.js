import { describe, it, expect } from 'vitest';
import { resolverEfeitosEntidade } from './efeitos-resolver';

// ---------------------------------------------------------------------------
// QA (gap) — core/efeitos-resolver.js não tinha nenhum teste direto. É usado por
// getPoderDiretoMultiplier (core/poder.js e o useMemo espelhado em
// Ficha Def/Marcados.jsx) tanto pra Poderes Clássicos (ficha.poderes) quanto pra
// Pactos/Entidades Seladas (ficha.seresSelados) — e um Pacto recém-criado por
// PactosPanel.jsx sempre nasce com `formas: [], formaAtivaId: null` (ver
// PactosPanel.jsx > salvarPacto), então o caso "sem Formas" é o caminho mais
// comum de todos, não um edge case raro.
// ---------------------------------------------------------------------------
describe('core/efeitos-resolver - resolverEfeitosEntidade', () => {
    it('retorna efeitos/efeitosPassivos vazios sem lançar quando a entidade é null/undefined', () => {
        expect(resolverEfeitosEntidade(null)).toEqual({ efeitos: [], efeitosPassivos: [] });
        expect(resolverEfeitosEntidade(undefined)).toEqual({ efeitos: [], efeitosPassivos: [] });
    });

    it('um Pacto SEM Formas (formas: [], formaAtivaId: null) — o shape padrão de um Pacto recém-criado por PactosPanel — retorna os efeitos base intactos, sem lançar', () => {
        const pacto = {
            id: 'pacto-1', nome: 'Sylphie', ativo: true,
            efeitos: [{ nome: 'Bencao', atributo: 'poder_direto', propriedade: 'munico', valor: '2.0' }],
            efeitosPassivos: [{ nome: 'Aura', atributo: 'poder_direto', propriedade: 'mbase', valor: '0.5' }],
            formas: [], formaAtivaId: null, configAtivaId: null,
        };

        expect(() => resolverEfeitosEntidade(pacto)).not.toThrow();
        const resolved = resolverEfeitosEntidade(pacto);
        expect(resolved.efeitos).toEqual(pacto.efeitos);
        expect(resolved.efeitosPassivos).toEqual(pacto.efeitosPassivos);
    });

    it('formaAtivaId apontando pra uma Forma inexistente cai de volta nos efeitos base (não lança, não retorna vazio)', () => {
        const pacto = {
            efeitos: [{ nome: 'Base', atributo: 'poder_direto', propriedade: 'mbase', valor: '1' }],
            efeitosPassivos: [],
            formas: [{ id: 'forma-outra', efeitos: [{ nome: 'X', valor: '99' }] }],
            formaAtivaId: 'forma-que-nao-existe',
        };

        const resolved = resolverEfeitosEntidade(pacto);
        expect(resolved.efeitos).toEqual(pacto.efeitos);
    });

    it('Forma ativa com acumulaFormaBase !== false (padrão) SOMA os efeitos da Forma aos efeitos base', () => {
        const entidade = {
            efeitos: [{ nome: 'Base', valor: '1' }],
            efeitosPassivos: [{ nome: 'BasePassivo', valor: '1' }],
            formas: [{ id: 'f1', efeitos: [{ nome: 'DaForma', valor: '2' }], efeitosPassivos: [{ nome: 'DaFormaPassivo', valor: '2' }] }],
            formaAtivaId: 'f1',
        };

        const resolved = resolverEfeitosEntidade(entidade);
        expect(resolved.efeitos).toEqual([{ nome: 'Base', valor: '1' }, { nome: 'DaForma', valor: '2' }]);
        expect(resolved.efeitosPassivos).toEqual([{ nome: 'BasePassivo', valor: '1' }, { nome: 'DaFormaPassivo', valor: '2' }]);
    });

    it('Forma ativa com acumulaFormaBase === false SUBSTITUI completamente os efeitos base pelos da Forma', () => {
        const entidade = {
            efeitos: [{ nome: 'Base', valor: '1' }],
            efeitosPassivos: [{ nome: 'BasePassivo', valor: '1' }],
            formas: [{ id: 'f1', acumulaFormaBase: false, efeitos: [{ nome: 'SoDaForma', valor: '2' }], efeitosPassivos: [] }],
            formaAtivaId: 'f1',
        };

        const resolved = resolverEfeitosEntidade(entidade);
        expect(resolved.efeitos).toEqual([{ nome: 'SoDaForma', valor: '2' }]);
        expect(resolved.efeitosPassivos).toEqual([]);
    });
});
