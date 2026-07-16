import os
import unittest

import capcut_core as cc
from sanitize_srt_timing import sanitize


class TranscriptionQualityTests(unittest.TestCase):
    def test_normalizes_thai_unicode_and_hidden_spaces(self):
        self.assertEqual(cc._normalize_thai("ทํา\u200b  ได้"), "ทำ ได้")

    def test_keyterms_are_added_only_to_hotwords(self):
        old = os.environ.get("EASYCUT_KEYTERMS")
        try:
            os.environ["EASYCUT_KEYTERMS"] = "TOYOX, NANAK\nChatGPT, TOYOX"
            prompt, hotwords = cc._whisper_context()
            self.assertNotIn("TOYOX", prompt)
            self.assertEqual(hotwords, "TOYOX NANAK ChatGPT")
        finally:
            if old is None:
                os.environ.pop("EASYCUT_KEYTERMS", None)
            else:
                os.environ["EASYCUT_KEYTERMS"] = old

    def test_merges_whisper_fragments_without_losing_english_boundary(self):
        words = [
            {"start": 0.0, "end": 0.2, "word": "สวัส"},
            {"start": 0.2, "end": 0.4, "word": "ดี"},
            {"start": 0.4, "end": 0.7, "word": " ChatGPT"},
        ]
        merged = cc.merge_words_to_tokens(words)
        self.assertEqual(" ".join(x["word"] for x in merged), "สวัสดี ChatGPT")

    def test_rejects_unsafe_llm_rewrites(self):
        self.assertTrue(cc._is_safe_correction("แคปคัด", "แคปคัท"))
        self.assertFalse(cc._is_safe_correction("คลิป", "เปลี่ยนความหมายทั้งประโยค"))

    def test_sanitizes_overlaps_duplicates_and_long_cues(self):
        cues = [
            {"id": 1, "start": 0.0, "end": 0.6, "text": "สวัสดี", "time": ""},
            {"id": 2, "start": 0.0, "end": 2.0, "text": "สวัสดีครับ", "time": ""},
            {"id": 3, "start": 5.0, "end": 12.0, "text": "ข้อความนี้ต้องไม่ค้างนานเกินไป", "time": ""},
        ]
        result = sanitize(cues)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["text"], "สวัสดีครับ")
        self.assertLessEqual(max(x["end"] - x["start"] for x in result), 2.8)


if __name__ == "__main__":
    unittest.main()
