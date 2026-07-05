"""PDF 文本提取工具 — 使用 PyPDF2 解析上传的财报 PDF"""

import io
import logging
from PyPDF2 import PdfReader

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_content: bytes) -> str:
    """从 PDF 文件内容中提取文本

    Args:
        file_content: PDF 文件的原始字节内容

    Returns:
        提取到的文本内容。如果 PDF 是扫描件/图片（无嵌入文本层），返回空字符串。

    Raises:
        ValueError: PDF 已加密或文件损坏无法解析
    """
    try:
        pdf_file = io.BytesIO(file_content)
        reader = PdfReader(pdf_file)

        # 检查是否加密
        if reader.is_encrypted:
            raise ValueError("PDF 文件已加密，无法提取文本")

        page_count = len(reader.pages)
        logger.info(f"开始解析 PDF: {page_count} 页")

        texts: list[str] = []
        for i, page in enumerate(reader.pages):
            try:
                text = page.extract_text()
                if text:
                    texts.append(text.strip())
            except Exception as e:
                logger.warning(f"PDF 第 {i + 1} 页文本提取失败: {e}")

        full_text = "\n\n".join(texts)
        char_count = len(full_text)

        if char_count == 0:
            logger.warning(f"PDF 解析完成（{page_count} 页），但未提取到任何文本内容 — 可能是扫描件/图片 PDF")
        else:
            logger.info(f"PDF 解析完成: {page_count} 页, 提取 {char_count} 个字符")

        return full_text

    except ValueError:
        # 重新抛出我们自己的 ValueError（加密 PDF 等）
        raise
    except Exception as e:
        raise ValueError(f"PDF 文件解析失败: {type(e).__name__}: {e}") from e
