import { describe, it, expect } from 'vitest';
import { lerImagemComoBase64 } from './firebase-storage';

// ---------------------------------------------------------------------------
// QA — lerImagemComoBase64 substitui uploadImagem (Firebase Storage) em todos
// os uploaders de avatar/fundo/moldura/ícone (RelicarioPanel, Marcados,
// DiarioNPC) porque o upload pro Storage se mostrou não confiável em produção.
// A nova função só usa FileReader.readAsDataURL, sem nenhuma chamada de rede,
// reaproveitando a MESMA validação de tipo/tamanho de uploadImagem
// (validarArquivo, interna ao módulo).
// ---------------------------------------------------------------------------

// Helper: cria um File de teste com um tamanho de conteúdo controlável (em bytes),
// sem precisar de dados de imagem reais — o `type` do File é o que a validação
// de tipo verifica; o conteúdo em si é irrelevante pro FileReader no jsdom.
function criarArquivo(nomeArquivo, tipo, tamanhoBytes) {
    const conteudo = new Uint8Array(tamanhoBytes);
    return new File([conteudo], nomeArquivo, { type: tipo });
}

describe('firebase-storage — lerImagemComoBase64', () => {
    it('resolve com uma data URL "data:image/...;base64," para um PNG pequeno válido', async () => {
        const arquivo = criarArquivo('avatar.png', 'image/png', 1024);
        const resultado = await lerImagemComoBase64(arquivo);

        expect(typeof resultado).toBe('string');
        expect(resultado.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('resolve com uma data URL válida para um JPEG pequeno válido', async () => {
        const arquivo = criarArquivo('fundo.jpg', 'image/jpeg', 2048);
        const resultado = await lerImagemComoBase64(arquivo);

        expect(typeof resultado).toBe('string');
        expect(resultado.startsWith('data:image/jpeg;base64,')).toBe(true);
    });

    it('resolve com uma data URL válida para um WebP pequeno válido', async () => {
        const arquivo = criarArquivo('moldura.webp', 'image/webp', 512);
        const resultado = await lerImagemComoBase64(arquivo);

        expect(typeof resultado).toBe('string');
        expect(resultado.startsWith('data:image/webp;base64,')).toBe(true);
    });

    it('rejeita com mensagem amigável para um tipo de arquivo não permitido (ex.: PDF)', async () => {
        const arquivo = criarArquivo('documento.pdf', 'application/pdf', 1024);

        await expect(lerImagemComoBase64(arquivo)).rejects.toThrow(
            'Tipo de arquivo nao permitido. Use JPG, PNG ou WebP.'
        );
    });

    it('rejeita com mensagem amigável para um GIF (tipo de imagem fora da lista permitida)', async () => {
        const arquivo = criarArquivo('animado.gif', 'image/gif', 1024);

        await expect(lerImagemComoBase64(arquivo)).rejects.toThrow(
            'Tipo de arquivo nao permitido. Use JPG, PNG ou WebP.'
        );
    });

    it('rejeita com mensagem amigável para um arquivo maior que 5MB', async () => {
        const arquivo = criarArquivo('gigante.png', 'image/png', 5 * 1024 * 1024 + 1);

        await expect(lerImagemComoBase64(arquivo)).rejects.toThrow(
            'Arquivo muito grande. Maximo 5MB.'
        );
    });

    it('resolve normalmente para um arquivo bem no limite de 5MB (boundary)', async () => {
        const arquivo = criarArquivo('limite.png', 'image/png', 5 * 1024 * 1024);
        const resultado = await lerImagemComoBase64(arquivo);

        expect(resultado.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('rejeita (via Promise, sem lançar exceção síncrona) quando o arquivo é null', () => {
        let lancouSincrono = false;
        let promessa;
        try {
            promessa = lerImagemComoBase64(null);
        } catch (e) {
            lancouSincrono = true;
        }

        expect(lancouSincrono).toBe(false);
        return expect(promessa).rejects.toThrow('Nenhum arquivo selecionado.');
    });

    it('rejeita (via Promise, sem lançar exceção síncrona) quando o arquivo é undefined', () => {
        let lancouSincrono = false;
        let promessa;
        try {
            promessa = lerImagemComoBase64(undefined);
        } catch (e) {
            lancouSincrono = true;
        }

        expect(lancouSincrono).toBe(false);
        return expect(promessa).rejects.toThrow('Nenhum arquivo selecionado.');
    });
});
