// ==========================================
// 📷 Lado do navegador da leitura de imagens: reduz a imagem escolhida (canvas) e pede ao Gemini que leia o texto dela.
// Regras puras (limites, montagem do pedido) em core/imagemIA.js.
// ==========================================
import { chamarGemini } from './sextaFeiraIA';
import { validarArquivoImagem, separarDataUrl, LADO_MAXIMO_PX, LIMITE_BYTES_ENVIO, bytesDoBase64, montarContentsComImagens, filtrarImagensParaEnvio, INSTRUCAO_SISTEMA_IMAGEM } from '../core/imagemIA';

function carregarImagem(arquivo) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(arquivo);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Não consegui abrir "${arquivo.name || 'a imagem'}".`)); };
        img.src = url;
    });
}

// File -> { nome, mimeType: 'image/jpeg', data (base64) }, com o maior lado limitado e a qualidade baixada até caber no limite de envio.
export async function reduzirImagem(arquivo) {
    const v = validarArquivoImagem(arquivo);
    if (!v.ok) throw new Error(v.erro);
    const img = await carregarImagem(arquivo);
    const escala = Math.min(1, LADO_MAXIMO_PX / Math.max(img.width, img.height, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * escala));
    canvas.height = Math.max(1, Math.round(img.height * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Este navegador não consegue reduzir imagens.');
    ctx.fillStyle = '#ffffff'; // PNG com fundo transparente vira branco (texto escuro continua legível)
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const qualidade of [0.85, 0.7, 0.55]) {
        const partes = separarDataUrl(canvas.toDataURL('image/jpeg', qualidade));
        if (partes && bytesDoBase64(partes.data) <= LIMITE_BYTES_ENVIO) return { nome: arquivo.name || 'imagem', ...partes };
    }
    throw new Error(`"${arquivo.name || 'A imagem'}" continua grande demais mesmo reduzida. Recorte só a parte com o texto.`);
}

// Pede ao Gemini (chave da Sexta-Feira) que leia as imagens e responda o prompt dos importadores. Devolve o texto da resposta.
export async function lerImagensComIA({ chave, modelo, prompt, imagens, fetchImpl }) {
    const { imagens: ok } = filtrarImagensParaEnvio(imagens);
    if (ok.length === 0) throw new Error('Nenhuma imagem válida para enviar.');
    return chamarGemini({
        chave, modelo,
        systemInstruction: INSTRUCAO_SISTEMA_IMAGEM,
        contents: montarContentsComImagens(prompt, ok),
        ...(fetchImpl ? { fetchImpl } : {}),
    });
}
