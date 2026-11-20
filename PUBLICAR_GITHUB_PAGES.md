# Publicação no GitHub Pages

- Endereço público: https://armnrodrigues.github.io/nutricontrole-performance/
- Repositório: https://github.com/armnrodrigues/nutricontrole-performance (público, branch `main`, Pages em `/ (root)`)
- Acesso de escrita: deploy key "Claude Mac" (só este repositório), chave privada em `~/.ssh/nutricontrole_deploy`, alias SSH `github-nutricontrole`. Para revogar: Settings → Deploy keys → Delete.

## Como atualizar

Cada mudança feita pelo Claude nesta pasta vira commit e `git push`. O GitHub Pages republica sozinho em 1–2 minutos.
O artefato do Claude (https://claude.ai/artifact/WpSPHsJ2LF3L1vzi5UmKax) é publicado à parte, pelo próprio Claude.

## O que fica fora do repositório

`.gitignore` exclui exports do Apple Saúde, protocolos, PDFs, relatórios de QA e o contexto do projeto.

## Diferenças da versão pública

- Modo local: dados no navegador de cada aparelho. Backup e restauração em Ajustes.
- Leitura de PDF/foto por IA não funciona (precisa de backend com chave própria).
- No iPhone: Safari → Compartilhar → Adicionar à Tela de Início.
