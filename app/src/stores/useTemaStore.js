import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { TEMAS_PADRAO } from '../core/temas'

/**
 * Aplica variáveis CSS ao root do documento
 * @param {Object} vars - Objeto com pares key-value das variáveis CSS
 */
function aplicarVariaveisCSS(vars) {
  if (typeof window === 'undefined') return

  const root = document.documentElement
  Object.entries(vars).forEach(([chave, valor]) => {
    root.style.setProperty(chave, valor)
  })
}

/**
 * Obtém as variáveis CSS atualmente aplicadas
 * @returns {Object} - Objeto com as variáveis CSS
 */
function obterVariaveisCSS() {
  if (typeof window === 'undefined') return {}

  const vars = {}
  const style = window.getComputedStyle(document.documentElement)

  // Lista de variáveis que queremos obter
  const chaves = [
    '--cor-primaria', '--cor-primaria-rgb', '--cor-secundaria', '--cor-secundaria-rgb',
    '--cor-destaque', '--cor-destaque-rgb', '--cor-sucesso', '--cor-info',
    '--bg-body-1', '--bg-body-2', '--bg-panel', '--bg-panel-hover',
    '--border-primary', '--grid-color', '--shadow-primary'
  ]

  chaves.forEach(chave => {
    const valor = style.getPropertyValue(chave).trim()
    if (valor) vars[chave] = valor
  })

  return vars
}

// Leitura que nunca lança: com o armazenamento bloqueado, o store (criado no carregamento do
// módulo) quebrava a abertura do app.
function lerTemaSalvo() {
  try { return localStorage.getItem('rpgTema') } catch (e) { return null }
}

const useTemaStore = create(
  immer((set, get) => ({
    // Estado
    temaAtivo: lerTemaSalvo() || 'neon-ciano',
    temasCustom: {},

    /**
     * Define o tema ativo
     * @param {string} id - ID do tema
     */
    setTema(id) {
      const todosTemas = get().getTodosOsTemas()
      const tema = todosTemas[id]

      if (!tema) {
        console.warn(`[TemaStore] Tema não encontrado: ${id}`)
        return
      }

      try {
        localStorage.setItem('rpgTema', id)
      } catch (err) {
        console.error('[TemaStore] Erro ao salvar tema no localStorage:', err)
      }

      aplicarVariaveisCSS(tema.vars)

      set((state) => {
        state.temaAtivo = id
      })
    },

    /**
     * Define os temas custom (carregados do Firebase)
     * @param {Object} temas - Objeto de temas custom
     */
    setTemasCustom(temas) {
      set((state) => {
        state.temasCustom = temas || {}
      })
    },

    /**
     * Salva um novo tema custom
     * @param {string} id - ID único do tema
     * @param {string} nome - Nome do tema
     * @param {string} emoji - Emoji do tema
     * @param {Object} vars - Objeto com variáveis CSS
     */
    salvarTemaCustom(id, nome, emoji, vars) {
      set((state) => {
        state.temasCustom[id] = {
          id,
          nome,
          emoji,
          descricao: `Tema custom criado`,
          vars: vars || obterVariaveisCSS(),
          custom: true,
          dataCriacao: new Date().toISOString()
        }
      })
    },

    /**
     * Remove um tema custom
     * @param {string} id - ID do tema custom a remover
     */
    removerTemaCustom(id) {
      set((state) => {
        delete state.temasCustom[id]
      })
    },

    /**
     * Retorna todos os temas (padrão + custom)
     * @returns {Object} - Objeto com todos os temas
     */
    getTodosOsTemas() {
      const { temasCustom } = get()
      return {
        ...TEMAS_PADRAO,
        ...temasCustom
      }
    },

    /**
     * Obtém um tema específico
     * @param {string} id - ID do tema
     * @returns {Object|null} - Tema ou null
     */
    obterTema(id) {
      const todos = get().getTodosOsTemas()
      return todos[id] || null
    },

    /**
     * Inicia o tema salvo na inicialização
     */
    iniciarTema() {
      const temaId = lerTemaSalvo() || 'neon-ciano'
      const tema = get().obterTema(temaId)

      if (tema) {
        aplicarVariaveisCSS(tema.vars)
        set((state) => {
          state.temaAtivo = temaId
        })
      } else {
        // Fallback para o tema padrão
        const temaPadrao = TEMAS_PADRAO['neon-ciano']
        aplicarVariaveisCSS(temaPadrao.vars)
        set((state) => {
          state.temaAtivo = 'neon-ciano'
        })
      }
    }
  }))
)

export default useTemaStore
