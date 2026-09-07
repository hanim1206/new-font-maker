# 폰트 레퍼런스 랩 데이터

`npm run reference:lab`은 인터넷이나 LLM을 호출하지 않고, 로컬의
`.reference-fonts/`에 있는 폰트 파일을 FontTools로 읽는다.

Python 의존성은 `scripts/reference-lab/requirements.txt`에 고정되어 있다.
한 번 준비한 뒤의 윤곽 추출과 화면 비교에는 네트워크나 AI 토큰이 들지
않는다.

R0에서 사용하는 여섯 파일과 예상 SHA-256은
[`font-catalog.v1.json`](./font-catalog.v1.json)이 원본이다. 파일이 없거나
해시가 다르면 다른 폰트로 대체하지 않고 비교를 중단한다.

```text
.reference-fonts/
├── NotoSansKR.ttf
├── IBMPlexSansKR-Regular.ttf
├── NanumGothic-Regular.ttf
├── Dotum-Regular.ttf
├── GowunDodum-Regular.ttf
└── BlackHanSans-Regular.ttf
```

폰트 바이너리와 런타임 캐시는 Git에 넣지 않는다. R0 서버는 윤곽을
메모리에만 캐시하며 파일을 만들거나 프리셋·프로젝트 데이터를 수정하지
않는다.

새 폰트는 파일을 `.reference-fonts/`에 둔 뒤 출처·라이선스·버전·weight·
축·SHA-256을 catalog에 추가하는 방식으로 등록한다. catalog 검증을 통과한
항목만 화면에 나타나며, `core`나 `style target` 같은 분석 역할은 폰트의
고유 정보가 아니므로 이후 분석 세션에서 별도로 정한다.
