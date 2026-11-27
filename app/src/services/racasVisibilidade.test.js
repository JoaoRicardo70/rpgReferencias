import { describe, it, expect, vi, beforeEach } from 'vitest';
import useStore from '../stores/useStore';

vi.mock('./firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarCamposPersonagem: vi.fn(() => Promise.resolve(true)),
    enviarParaFeed: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));
import * as sync from './firebase-sync';
import { definirVisibilidadeRaca, removerRacaDaComposicao, definirComposicaoRacial } from './composicaoRacial';
import { definirRacaDoPersonagemDireto } from './racasMesa';

const cenario = { racas: [{ id: 'saiyajin', nome: 'Saiyajin' }, { id: 'humano', nome: 'Humano' }] };
const fichaBase = (vis) => ({ bio: { raca: 'Saiyajin', racaId: 'saiyajin', composicaoRacial: [{ racaId: 'saiyajin', percentual: 100, origem: 'nativa' }, { racaId: 'humano', percentual: 10, origem: 'adquirida' }], ...(vis ? { racaVisibilidade: vis } : {}) }, poderes: [] });
function montar({ isMestre = false, minha = fichaBase(), outros = {}, modoJogador = false } = {}) {
    useStore.setState({ meuNome: 'Goku', isMestre: isMestre && !modoJogador, souMestreReal: isMestre, modoJogador, cenario, minhaFicha: minha, personagens: outros });
}
const eu = { id: 'Goku', nome: 'Goku' };
const outro = { id: 'Vegeta', nome: 'Vegeta' };
beforeEach(() => { vi.clearAllMocks(); });

describe('definirVisibilidadeRaca: jogador', () => {
    it('alterna publica e privada na própria ficha e grava com debounce', () => {
        montar();
        expect(definirVisibilidadeRaca(eu, 'humano', 'privada').ok).toBe(true);
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toEqual({ humano: 'privada' });
        expect(sync.salvarFichaSilencioso).toHaveBeenCalled();
        expect(definirVisibilidadeRaca(eu, 'humano', 'publica').ok).toBe(true);
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toBeUndefined();
    });
    it('nunca define nem desfaz secreta', () => {
        montar();
        expect(definirVisibilidadeRaca(eu, 'humano', 'secreta').ok).toBe(false);
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toBeUndefined();
        montar({ minha: fichaBase({ humano: 'secreta' }) });
        expect(definirVisibilidadeRaca(eu, 'humano', 'publica').ok).toBe(false);
        expect(definirVisibilidadeRaca(eu, 'humano', 'privada').ok).toBe(false);
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toEqual({ humano: 'secreta' });
        expect(sync.salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('recusa outro jogador e Modo Jogador do Mestre', () => {
        montar({ outros: { Vegeta: fichaBase() } });
        expect(definirVisibilidadeRaca(outro, 'humano', 'privada').ok).toBe(false);
        expect(sync.salvarCamposPersonagem).not.toHaveBeenCalled();
        montar({ isMestre: true, modoJogador: true, outros: { Vegeta: fichaBase() } });
        expect(definirVisibilidadeRaca(outro, 'humano', 'secreta').ok).toBe(false);
        expect(definirVisibilidadeRaca(eu, 'humano', 'secreta').ok).toBe(false);
    });
    it('Raça fora do catálogo e nível inválido são recusados; _principal vale', () => {
        montar();
        expect(definirVisibilidadeRaca(eu, 'orc', 'privada').ok).toBe(false);
        expect(definirVisibilidadeRaca(eu, 'humano', 'xpto').ok).toBe(false);
        expect(definirVisibilidadeRaca(eu, '_principal', 'privada').ok).toBe(true);
    });
});

describe('definirVisibilidadeRaca: Mestre', () => {
    it('qualquer nível em outro jogador, de forma granular', () => {
        montar({ isMestre: true, outros: { Vegeta: fichaBase() } });
        expect(definirVisibilidadeRaca(outro, 'saiyajin', 'secreta').ok).toBe(true);
        expect(sync.salvarCamposPersonagem).toHaveBeenCalledWith('Vegeta', { 'bio/racaVisibilidade/saiyajin': 'secreta' });
        montar({ isMestre: true, outros: { Vegeta: fichaBase({ saiyajin: 'secreta' }) } });
        definirVisibilidadeRaca(outro, 'saiyajin', 'publica');
        expect(sync.salvarCamposPersonagem).toHaveBeenLastCalledWith('Vegeta', { 'bio/racaVisibilidade/saiyajin': null });
    });
    it('Feed só ao REVELAR, nada ao ocultar', () => {
        montar({ isMestre: true });
        definirVisibilidadeRaca(eu, 'humano', 'secreta');
        definirVisibilidadeRaca(eu, 'humano', 'privada');
        expect(sync.enviarParaFeed).not.toHaveBeenCalled();
        definirVisibilidadeRaca(eu, 'humano', 'publica');
        expect(sync.enviarParaFeed).toHaveBeenCalledTimes(1);
        expect(sync.enviarParaFeed.mock.calls[0][0].texto).toBe('🧬 A Raça de Goku foi revelada: Humano');
    });
    it('jogador tornando a própria Raça pública não vai ao Feed', () => {
        montar({ minha: fichaBase({ humano: 'privada' }) });
        definirVisibilidadeRaca(eu, 'humano', 'publica');
        expect(sync.enviarParaFeed).not.toHaveBeenCalled();
    });
});

describe('limpeza da visibilidade', () => {
    it('remover a Raça da composição limpa a visibilidade dela (mantém a principal)', () => {
        montar({ isMestre: true, minha: fichaBase({ humano: 'secreta', saiyajin: 'privada' }) });
        expect(removerRacaDaComposicao(eu, 'humano').ok).toBe(true);
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toEqual({ saiyajin: 'privada' });
    });
    it('em outro jogador grava o mapa limpo', () => {
        montar({ isMestre: true, outros: { Vegeta: fichaBase({ humano: 'secreta' }) } });
        removerRacaDaComposicao(outro, 'humano');
        expect(sync.salvarCamposPersonagem.mock.calls[0][1]['bio/racaVisibilidade']).toBeNull();
    });
    it('redefinir a composição sem a Raça também limpa', () => {
        montar({ isMestre: true, minha: fichaBase({ humano: 'secreta' }) });
        definirComposicaoRacial(eu, [{ racaId: 'saiyajin', percentual: 100, origem: 'nativa' }]);
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toBeUndefined();
    });
    it('jogador não troca a principal secreta', () => {
        montar({ minha: fichaBase({ saiyajin: 'secreta' }) });
        expect(definirRacaDoPersonagemDireto(eu, 'humano')).toBe(false);
        montar({ minha: fichaBase({ saiyajin: 'privada' }) });
        expect(definirRacaDoPersonagemDireto(eu, 'humano')).toBe(true);
    });
});

describe('Feed público nunca nomeia Raça oculta', () => {
    const feeds = () => sync.enviarParaFeed.mock.calls.map(c => c[0].texto);
    const comPoder = (vis, percentual = 10) => ({ ...fichaBase(vis), bio: { ...fichaBase(vis).bio, composicaoRacial: [{ racaId: 'saiyajin', percentual: 100, origem: 'nativa' }, { racaId: 'humano', percentual, origem: 'adquirida' }] }, poderes: [{ id: 5, nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['humano'], percentualMinimo: 50, ativa: true }] });
    it.each([['publica', true], ['privada', false], ['secreta', false]])('prática com Raça %s (nome no Feed = %s)', async (nivel, nomeia) => {
        const { concederPraticaRacial } = await import('./composicaoRacial');
        montar({ isMestre: true, minha: comPoder(nivel === 'publica' ? null : { humano: nivel }) });
        expect(concederPraticaRacial(eu, 'humano', 5).ok).toBe(true);
        const texto = feeds().join(' | ');
        if (nomeia) expect(texto).toMatch(/praticou Humano: 10% → 15%/);
        else { expect(texto).not.toMatch(/Humano|%/); expect(texto).toMatch(/praticou o Domínio de uma Raça/); }
    });
    it('adicionar e aprovar Raça adquirida: sempre genérico', async () => {
        const { adicionarRacaAdquirida, aprovarPedidoRaca } = await import('./composicaoRacial');
        montar({ isMestre: true, minha: { ...fichaBase(), bio: { raca: 'Saiyajin', racaId: 'saiyajin' } } });
        adicionarRacaAdquirida(eu, 'humano');
        const f = fichaBase(); f.bio.composicaoRacial = [{ racaId: 'saiyajin', percentual: 100, origem: 'nativa' }];
        f.bio.pedidosRaca = [{ id: 'p1', racaId: 'humano', motivo: 'x', ts: 1 }]; f.poderes = [{ id: 1, nome: 'DNA', manipulaDNA: true }];
        montar({ isMestre: true, minha: f });
        aprovarPedidoRaca(eu, 'p1');
        expect(feeds().join(' | ')).not.toMatch(/Humano|Saiyajin|%/);
        expect(feeds().filter(t => /adquiriu uma nova Raça/.test(t))).toHaveLength(2);
    });
    it('pedido: nomeia só se pública; desligada e despertou sem Raça/percentual', async () => {
        const { pedirRacaAdquirida, despertarHabilidade, definirComposicaoRacial } = await import('./composicaoRacial');
        const f = fichaBase({ humano: 'privada' }); f.poderes = [{ id: 1, nome: 'DNA', manipulaDNA: true }];
        f.bio.composicaoRacial = [{ racaId: 'saiyajin', percentual: 100, origem: 'nativa' }];
        montar({ minha: f });
        pedirRacaAdquirida('humano', 'm');
        expect(feeds().join('|')).toMatch(/pediu uma nova Raça/);
        expect(feeds().join('|')).not.toMatch(/Humano/);
        const g = comPoder(null, 60);
        montar({ isMestre: true, minha: g });
        definirComposicaoRacial(eu, [{ racaId: 'saiyajin', percentual: 100, origem: 'nativa' }, { racaId: 'humano', percentual: 5, origem: 'adquirida' }]);
        const desl = feeds().filter(t => /desligada/.test(t)).join('|');
        expect(desl).toMatch(/Zenkai foi desligada/);
        expect(desl).not.toMatch(/Domínio|Humano|%/);
        const h = fichaBase(); h.poderes = [{ id: 9, nome: 'Kaioken', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], bloqueio: { ativo: true, requisito: 'r', motivo: 'm' } }];
        montar({ isMestre: true, minha: h });
        despertarHabilidade(eu, 9);
        expect(feeds().join('|')).toMatch(/Goku despertou Kaioken/);
    });
});

describe('Feed: habilidade racial sem nome quando há Raça não pública', () => {
    const feeds = () => sync.enviarParaFeed.mock.calls.map(c => c[0].texto).join(' | ');
    const fichaComPoder = (vis) => {
        const f = fichaBase(vis);
        f.poderes = [{ id: 5, nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['humano'], percentualMinimo: 50, ativa: true }];
        return f;
    };
    it.each([['publica', true], ['privada', false], ['secreta', false]])('desligada e despertou com Raça %s (nome da habilidade = %s)', async (nivel, nomeia) => {
        const { despertarHabilidade, definirComposicaoRacial } = await import('./composicaoRacial');
        montar({ isMestre: true, minha: fichaComPoder(nivel === 'publica' ? null : { saiyajin: nivel }) });
        definirComposicaoRacial(eu, [{ racaId: 'saiyajin', percentual: 100, origem: 'nativa' }, { racaId: 'humano', percentual: 5, origem: 'adquirida' }]);
        if (nomeia) expect(feeds()).toMatch(/Zenkai foi desligada/);
        else { expect(feeds()).not.toMatch(/Zenkai/); expect(feeds()).toMatch(/teve uma habilidade racial desligada/); }
        const h = fichaBase(nivel === 'publica' ? null : { saiyajin: nivel });
        h.poderes = [{ id: 9, nome: 'Kaioken', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], bloqueio: { ativo: true, requisito: 'r', motivo: 'm' } }];
        montar({ isMestre: true, minha: h });
        despertarHabilidade(eu, 9);
        if (nomeia) expect(feeds()).toMatch(/Goku despertou Kaioken/);
        else { expect(feeds()).not.toMatch(/Kaioken/); expect(feeds()).toMatch(/despertou uma habilidade racial/); }
    });
    it('pedir Raça que já tem: mensagem não cita a Raça oculta', async () => {
        const { pedirRacaAdquirida } = await import('./composicaoRacial');
        const f = fichaBase({ humano: 'secreta' }); f.poderes = [{ id: 1, nome: 'DNA', manipulaDNA: true }];
        montar({ minha: f });
        const r = pedirRacaAdquirida('humano', 'm');
        expect(r.ok).toBe(false);
        expect(r.mensagem).not.toMatch(/Humano/);
        const g = fichaBase(); g.poderes = [{ id: 1, nome: 'DNA', manipulaDNA: true }];
        montar({ minha: g });
        expect(pedirRacaAdquirida('humano', 'm').mensagem).toMatch(/Humano/);
    });
});
