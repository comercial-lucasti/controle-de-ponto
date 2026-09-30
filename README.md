<div align="center">

# Controle de Ponto

**Registro de ponto, resumo diário para o gestor e Diário de Bordo em PDF, automatizados com Google Apps Script, Google Sheets e Google Colab.**

![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-2b2b2b?style=for-the-badge&logo=google&logoColor=E0B101)
![Python](https://img.shields.io/badge/Python-2b2b2b?style=for-the-badge&logo=python&logoColor=E0B101)
![Google Colab](https://img.shields.io/badge/Google%20Colab-2b2b2b?style=for-the-badge&logo=googlecolab&logoColor=E0B101)
![Licença](https://img.shields.io/badge/Licen%C3%A7a-MIT-E0B101?style=for-the-badge&labelColor=2b2b2b)

</div>

---

## O que faz

| Etapa | Como funciona |
|---|---|
| 1. Registro | Uma página com quatro botões (Entrada, Saída para almoço, Retorno do almoço, Saída) chama o Web App |
| 2. Gravação | Cada batida vira uma linha na planilha (`Data, Hora, Nome, Ação, Timestamp`) |
| 3. Comprovante | O colaborador recebe um e-mail com o horário registrado |
| 4. Resumo diário | O gestor recebe **um único e-mail por dia** com as batidas e a jornada trabalhada |
| 5. Diário de Bordo | O notebook do Colab lê a planilha e gera o PDF do período, pronto para assinar |

## Regras de negócio

- **Anti-duplicidade:** a mesma ação do mesmo nome em 90 segundos é ignorada.
- **Batidas repetidas:** no resumo, ações iguais com menos de 3 minutos entre si contam como uma.
- **Jornada:** `Saída − Entrada − (Retorno do almoço − Saída para almoço)`.
- **Privacidade do gestor:** ele só recebe o resumo; comprovantes e testes nunca vão para ele.
- **Planilha segura:** textos que começam com `=`, `+`, `-` ou `@` são neutralizados.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `apps-script/` | `Code.gs` (back-end) e `appsscript.json` (manifesto do Web App) |
| `colab/` | `diario_de_bordo.ipynb`: gera o Diário de Bordo em PDF |
| `docs/` | `pagina-exemplo.html`: página de exemplo com os quatro botões |
| `exemplos/` | `ponto_exemplo.csv`: dados **fictícios** para testar o notebook |

## Instalação

**1. Apps Script**
1. Crie uma planilha e abra **Extensões → Apps Script**.
2. Cole o `Code.gs` e ajuste o `appsscript.json`.
3. Em **Configurações do projeto → Propriedades do script**, cadastre:

| Propriedade | Descrição |
|---|---|
| `EMAIL_COLABORADOR` | Recebe o comprovante de cada batida |
| `EMAIL_GESTOR` | Recebe o resumo diário |
| `NOME_ORGANIZACAO` | Nome exibido nos e-mails (opcional) |
| `ID_PLANILHA` | Opcional. Vazio usa a planilha vinculada ao script |

4. **Implantar → Nova implantação → App da Web**, executando como você e com acesso restrito à sua organização.
5. Execute `resetarGatilhos()` uma vez para criar o gatilho do resumo às ~18h.
6. Use `testarResumo()` para receber um resumo de teste (vai só para `EMAIL_COLABORADOR`).

**2. Página de registro**
Abra `docs/pagina-exemplo.html`, preencha `URL_WEBAPP` com a URL `/exec` da sua implantação e publique onde quiser (por exemplo, no Google Sites).

**3. Diário de Bordo**
Abra `colab/diario_de_bordo.ipynb` no Google Colab, edite a célula de configuração (empresa, setor e nome), execute tudo e envie o `.xlsx` ou `.csv` exportado da planilha. O notebook reconhece as colunas pelo nome, com ou sem cabeçalho.

## Privacidade e LGPD

Registros de ponto são **dados pessoais**. Mantenha a planilha e o Web App restritos à sua organização, informe os colaboradores sobre o tratamento e **não publique dados reais neste repositório**: o `.gitignore` ignora planilhas e PDFs.

## Limitações

| Limite | Efeito |
|---|---|
| Cota do `MailApp` | Cada batida envia 1 e-mail; o limite diário depende do tipo de conta |
| Página com `fetch` em modo `no-cors` | O navegador não lê a resposta; a confirmação chega por e-mail |
| Um único gatilho diário | O resumo vale para o dia em que o gatilho roda |

## Licença

[MIT](LICENSE) © 2026 Lucas T.I
