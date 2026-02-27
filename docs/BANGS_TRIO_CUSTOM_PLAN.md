# Bang's Trio Custom Plan

주원 전용 패밀리 대시보드 커스터마이징 계획

## 목표
- 방울이(리드), 이슬이(콘텐츠), 리니(브랜드) 3친구 운영 현황을 한 화면에서 확인
- 크론 건강도/실패 원인/다음 실행 시간 즉시 파악
- 방울이의 케어 활동(점검/조치 로그)을 시각화

## 1차 적용(이번 커밋)
- 기본 브랜딩 텍스트를 `Bang's Trio Mission Control`로 변경
- 랜딩/푸터에 패밀리 운영 목적 문구 반영

## 2차 예정
1. Agent Cards 고정
   - 3친구 카드(상태/최근 활동/담당업무)
2. Cron Timeline
   - 오늘 실행 내역 + 오류 배지 + 재시도 버튼
3. Skill Matrix
   - 친구별 보유 스킬 / 최근 사용 빈도
4. Care Log
   - 방울이 점검 기록(6am/7am 보고) 요약 패널
5. Alerts
   - 실패 크론, 모델 불일치, 토큰 급증 알림

## 참고 데이터 소스
- `openclaw cron list --json`
- `openclaw status`
- 각 워크스페이스 `skills/`, `memory/`
- (선택) 세션/서브에이전트 실행 로그

## 브랜치
- `our-family-dashboard`
