import zipfile
import xml.etree.ElementTree as ET

path = r"C:\Users\Admin\Downloads\Telegram Desktop\VORA_DOCS (2).docx"
try:
    document = zipfile.ZipFile(path)
    xml_content = document.read('word/document.xml')
    document.close()
    
    tree = ET.XML(xml_content)
    with open('doc_content.txt', 'w', encoding='utf-8') as f:
        for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
            texts = [n.text for n in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if n.text]
            if texts:
                f.write(''.join(texts) + '\n')
    print("Success")
except Exception as e:
    print(f"Error: {e}")
