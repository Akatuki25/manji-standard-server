// mss-protoc-gen は proto メッセージから DDD の Entity / Repository interface /
// Repository Mock / Postgres (GORM) Repository 実装 / Usecase interface / Handler /
// DI 配線を生成する。
//
// テンプレートは `generator/<kind>/output/<ターゲットパス>/<name>.tpl` に置き、
// //go:embed で埋め込む。各テンプレートの出力先は目的のファイルパスをミラーする。
//
// アノテーション（proto コメント上に記述）:
//
//	@entity       メッセージ全体に付与。Entity / Repository / Mock / Postgres 実装を生成。
//	@pk           フィールドに付与。主キー。SelectByPK / Delete / BulkDelete が生成される。
//	@unique       フィールドに付与。SelectBy<Field> メソッドが追加で生成される。
//	@email        フィールドに付与。email 形式バリデーション。
//	@required     フィールドに付与。非空バリデーション。
//	@timestamp    int64 フィールドに付与。Entity 側で time.Time にマップされる。
//
// service が宣言されていれば、加えて:
//   - pkg/usecase/<service>_usecase.gen.go  Usecase interface + Input 型
//   - pkg/handler/<service>_handler.gen.go  Connect Handler（薄いラッパ）
//   - pkg/di/handlers.gen.go                全 Handler を束ねた DI 配線
//
// を生成する。
package main

import (
	"bytes"
	"embed"
	"fmt"
	"sort"
	"strings"
	"text/template"

	"google.golang.org/protobuf/compiler/protogen"
	"google.golang.org/protobuf/reflect/protoreflect"
)

const (
	goImportEntity     = "github.com/example/manji-standard-server-go/pkg/domain/entity"
	goImportRepository = "github.com/example/manji-standard-server-go/pkg/domain/repository"
	goImportMock       = "github.com/example/manji-standard-server-go/pkg/domain/repository/mock"
	goImportInfraRepo  = "github.com/example/manji-standard-server-go/pkg/infra/repository"
	goImportUsecase    = "github.com/example/manji-standard-server-go/pkg/usecase"
	goImportHandler    = "github.com/example/manji-standard-server-go/pkg/handler"
	goImportDI         = "github.com/example/manji-standard-server-go/pkg/di"
)

//go:embed generator
var templatesFS embed.FS

// entityKind はエンティティ 1 つにつき 1 ファイルを出力する種別。
type entityKind struct {
	name     string
	tplPath  string
	outPath  func(snake string) string
	importAs string
}

var entityKinds = []entityKind{
	{
		name:    "entity",
		tplPath: "generator/entity/output/pkg/domain/entity/entity.gen.go.tpl",
		outPath: func(snake string) string {
			return fmt.Sprintf("pkg/domain/entity/%s.gen.go", snake)
		},
		importAs: goImportEntity,
	},
	{
		name:    "repository",
		tplPath: "generator/repository/output/pkg/domain/repository/repository.gen.go.tpl",
		outPath: func(snake string) string {
			return fmt.Sprintf("pkg/domain/repository/%s_repository.gen.go", snake)
		},
		importAs: goImportRepository,
	},
	{
		name:    "mock",
		tplPath: "generator/mock/output/pkg/domain/repository/mock/mock_repository.gen.go.tpl",
		outPath: func(snake string) string {
			return fmt.Sprintf("pkg/domain/repository/mock/mock_%s_repository.gen.go", snake)
		},
		importAs: goImportMock,
	},
	{
		name:    "infra_postgres_repository",
		tplPath: "generator/infra_postgres_repository/output/pkg/infra/repository/postgres_repository.gen.go.tpl",
		outPath: func(snake string) string {
			return fmt.Sprintf("pkg/infra/repository/%s_postgres_repository.gen.go", snake)
		},
		importAs: goImportInfraRepo,
	},
}

// serviceKind は service 1 つにつき 1 ファイルを出力する種別。
type serviceKind struct {
	name     string
	tplPath  string
	outPath  func(snake string) string
	importAs string
}

var serviceKinds = []serviceKind{
	{
		name:    "usecase",
		tplPath: "generator/usecase/output/pkg/usecase/usecase.gen.go.tpl",
		outPath: func(snake string) string {
			return fmt.Sprintf("pkg/usecase/%s_usecase_interface.gen.go", snake)
		},
		importAs: goImportUsecase,
	},
	{
		name:    "handler_rest",
		tplPath: "generator/handler_rest/output/pkg/handler/handler.gen.go.tpl",
		outPath: func(snake string) string {
			return fmt.Sprintf("pkg/handler/%s_handler.gen.go", snake)
		},
		importAs: goImportHandler,
	},
}

// projectKind はプロジェクト全体で 1 ファイルだけ出す種別（DI 配線など）。
type projectKind struct {
	name     string
	tplPath  string
	outPath  string
	importAs string
}

var projectKinds = []projectKind{
	{
		name:     "di",
		tplPath:  "generator/di/output/pkg/di/handlers.gen.go.tpl",
		outPath:  "pkg/di/handlers.gen.go",
		importAs: goImportDI,
	},
}

// ==================== data types ====================

type tplField struct {
	GoName      string
	ParamName   string
	SnakeName   string
	ProtoType   string
	GoType      string
	PbFieldGo   string // pb 側での Go フィールド名（timestamp だと末尾 "Unix"）
	IsPK        bool
	IsUnique    bool
	IsEmail     bool
	IsRequired  bool
	IsTimestamp bool
}

type tplData struct {
	Name              string
	SnakeName         string
	LowerFirst        string
	Plural            string
	Receiver          string
	Fields            []tplField
	PKField           tplField
	UniqueFieldsNonPK []tplField
	ImportEntity      string
	ImportRepository  string
	ImportMock        string
	ImportInfraRepo   string
}

// usecase / handler 向けのデータ構造。

type tplInputField struct {
	GoName    string // Input struct フィールド名（initialism 正規化済み、例 "ID"）
	JsonName  string // JSON / URL param の元名（例 "id"、proto のフィールド名そのまま）
	ParamName string // "email"
	GoType    string // "string"
}

type tplHttp struct {
	Method string // "GET" / "POST" / ...
	Path   string // "/api/users/{id}"
}

type tplMethod struct {
	Name             string          // "CreateUser"
	InputTypeName    string          // "CreateUserInput"
	InputFields      []tplInputField // Request を展開した input 型フィールド（全件）
	PathParamFields  []tplInputField // URL の {name} に対応
	BodyFields       []tplInputField // それ以外（POST/PUT/PATCH の body に入る）
	HasInputFields   bool
	HasPathParams    bool
	HasBodyFields    bool
	EntityGoName     string // 対応する @entity の Go 名（Response の単一フィールドが entity なら設定）
	EntityLowerFirst string
	ReturnsEntity    bool // Response が単一 entity フィールド
	ReturnsList      bool // Response が repeated entity フィールド
	ReturnsEmpty     bool // それ以外（Empty など）
	Http             *tplHttp
}

type tplService struct {
	ServiceName      string // "UserService"
	ServiceSnake     string // "user_service"
	HandlerTypeName  string // "UserHandler"
	UsecaseTypeName  string // "UserUsecase"
	UsecaseParamName string // "userUsecase"
	Methods          []tplMethod
	UsedEntities     []tplEntityRef // Handler が使う entity 群（変換関数生成用）
	AnyReturnsEntity bool           // entity import の要否を判定
	ImportEntity     string
	ImportRepository string
	ImportUsecase    string
}

type tplEntityRef struct {
	Name       string     // "User"
	LowerFirst string     // "user"
	SnakeName  string     // "user"
	Fields     []tplField // entity の全フィールド（pb 変換に使う）
}

type tplDI struct {
	Services      []tplService
	ImportUsecase string
	ImportHandler string
}

// ==================== main ====================

func main() {
	protogen.Options{}.Run(func(gen *protogen.Plugin) error {
		tmpls, err := loadTemplates()
		if err != nil {
			return err
		}

		// Pass 1: すべての @entity メッセージを収集（service 解析時に参照）
		entitiesByMsg := map[protoreflect.FullName]*entitySpec{}
		for _, f := range gen.Files {
			if !f.Generate {
				continue
			}
			for _, msg := range f.Messages {
				if e := parseEntity(msg); e != nil {
					entitiesByMsg[msg.Desc.FullName()] = e
					// pb フィールド名を記録するために msg も一緒に持つ
					e.PbMessage = msg
				}
			}
		}

		// Pass 2: エンティティ kind を実行
		for _, f := range gen.Files {
			if !f.Generate {
				continue
			}
			for _, msg := range f.Messages {
				e, ok := entitiesByMsg[msg.Desc.FullName()]
				if !ok {
					continue
				}
				data := toTplData(e)
				for _, kind := range entityKinds {
					if err := execTpl(gen, tmpls[kind.name], kind.outPath(e.SnakeName), kind.importAs, data); err != nil {
						return fmt.Errorf("%s: %w", kind.name, err)
					}
				}
			}
		}

		// Pass 3: service kind を実行
		var allServices []tplService
		for _, f := range gen.Files {
			if !f.Generate {
				continue
			}
			for _, svc := range f.Services {
				s := buildServiceTpl(svc, f, entitiesByMsg)
				allServices = append(allServices, s)
				for _, kind := range serviceKinds {
					if err := execTpl(gen, tmpls[kind.name], kind.outPath(s.ServiceSnake), kind.importAs, s); err != nil {
						return fmt.Errorf("%s: %w", kind.name, err)
					}
				}
			}
		}

		// Pass 4: project kind（di）を一度だけ実行
		if len(allServices) > 0 {
			// service 名で安定ソート
			sort.Slice(allServices, func(i, j int) bool { return allServices[i].ServiceName < allServices[j].ServiceName })
			di := tplDI{
				Services:      allServices,
				ImportUsecase: goImportUsecase,
				ImportHandler: goImportHandler,
			}
			for _, kind := range projectKinds {
				if err := execTpl(gen, tmpls[kind.name], kind.outPath, kind.importAs, di); err != nil {
					return fmt.Errorf("%s: %w", kind.name, err)
				}
			}
		}

		return nil
	})
}

func execTpl(gen *protogen.Plugin, tmpl *template.Template, outPath, importAs string, data any) error {
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return err
	}
	out := gen.NewGeneratedFile(outPath, protogen.GoImportPath(importAs))
	_, err := out.Write(buf.Bytes())
	return err
}

// loadTemplates は embed 済みの .tpl を全てパースして返す。
func loadTemplates() (map[string]*template.Template, error) {
	funcs := template.FuncMap{
		"goTestValue": goTestValue,
		"gormTag":     gormTag,
	}
	out := map[string]*template.Template{}
	add := func(name, path string) error {
		raw, err := templatesFS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		t, err := template.New(name).Funcs(funcs).Parse(string(raw))
		if err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		out[name] = t
		return nil
	}
	for _, k := range entityKinds {
		if err := add(k.name, k.tplPath); err != nil {
			return nil, err
		}
	}
	for _, k := range serviceKinds {
		if err := add(k.name, k.tplPath); err != nil {
			return nil, err
		}
	}
	for _, k := range projectKinds {
		if err := add(k.name, k.tplPath); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// ==================== entity parse ====================

type fieldSpec struct {
	GoName      string
	ParamName   string
	SnakeName   string
	ProtoType   string
	GoType      string
	PbFieldGo   string // pb 側での Go フィールド名（@timestamp だと "CreatedAtUnix"、それ以外は同じ）
	IsPK        bool
	IsUnique    bool
	IsEmail     bool
	IsRequired  bool
	IsTimestamp bool
}

type entitySpec struct {
	Name         string
	SnakeName    string
	Fields       []fieldSpec
	PKField      *fieldSpec
	UniqueFields []fieldSpec
	PbMessage    *protogen.Message // pb 変換で参照
}

func parseEntity(msg *protogen.Message) *entitySpec {
	if !hasMarker(string(msg.Comments.Leading), "@entity") {
		return nil
	}
	name := msg.GoIdent.GoName
	snake := toSnake(name)
	e := &entitySpec{Name: name, SnakeName: snake}

	for _, f := range msg.Fields {
		comment := string(f.Comments.Leading)
		goName := normalizeInitialisms(f.GoName)
		paramName := lowerFirst(f.GoName)
		snakeField := toSnake(f.GoName)
		pbFieldGo := f.GoName // 元の pb 側 Go 名

		spec := fieldSpec{
			GoName:      goName,
			ParamName:   paramName,
			SnakeName:   snakeField,
			ProtoType:   f.Desc.Kind().String(),
			PbFieldGo:   pbFieldGo,
			IsPK:        hasMarker(comment, "@pk"),
			IsUnique:    hasMarker(comment, "@unique"),
			IsEmail:     hasMarker(comment, "@email"),
			IsRequired:  hasMarker(comment, "@required"),
			IsTimestamp: hasMarker(comment, "@timestamp"),
		}

		switch {
		case spec.IsTimestamp:
			spec.GoType = "time.Time"
			trimmed := strings.TrimSuffix(spec.GoName, "Unix")
			spec.GoName = trimmed
			spec.ParamName = lowerFirst(trimmed)
			spec.SnakeName = toSnake(trimmed)
		case spec.ProtoType == "string":
			spec.GoType = "string"
		case spec.ProtoType == "int32":
			spec.GoType = "int32"
		case spec.ProtoType == "int64":
			spec.GoType = "int64"
		case spec.ProtoType == "bool":
			spec.GoType = "bool"
		default:
			spec.GoType = "string"
		}

		e.Fields = append(e.Fields, spec)
		if spec.IsPK {
			pk := spec
			e.PKField = &pk
		}
		if spec.IsUnique {
			e.UniqueFields = append(e.UniqueFields, spec)
		}
	}

	if e.PKField == nil {
		return nil
	}
	return e
}

// ==================== service parse ====================

func buildServiceTpl(svc *protogen.Service, f *protogen.File, entities map[protoreflect.FullName]*entitySpec) tplService {
	_ = f // proto package 情報は REST ハンドラ生成では不要
	serviceName := svc.GoName
	serviceSnake := toSnake(serviceName)
	serviceSnake = strings.TrimSuffix(serviceSnake, "_service")

	usecaseType := strings.TrimSuffix(serviceName, "Service") + "Usecase"
	s := tplService{
		ServiceName:      serviceName,
		ServiceSnake:     serviceSnake,
		HandlerTypeName:  strings.TrimSuffix(serviceName, "Service") + "Handler",
		UsecaseTypeName:  usecaseType,
		UsecaseParamName: lowerFirst(usecaseType),
		ImportEntity:     goImportEntity,
		ImportRepository: goImportRepository,
		ImportUsecase:    goImportUsecase,
	}

	entityRefByName := map[string]tplEntityRef{}

	for _, m := range svc.Methods {
		input := m.Input
		output := m.Output

		method := tplMethod{
			Name:          m.GoName,
			InputTypeName: m.GoName + "Input",
			Http:          parseHttpAnnotation(string(m.Comments.Leading)),
		}

		pathParamSet := map[string]struct{}{}
		if method.Http != nil {
			for _, p := range extractPathParams(method.Http.Path) {
				pathParamSet[p] = struct{}{}
			}
		}

		// Input 型のフィールドは Request メッセージをそのまま展開
		for _, reqField := range input.Fields {
			goName := normalizeInitialisms(reqField.GoName)
			jsonName := string(reqField.Desc.Name()) // proto 側の元フィールド名（snake 不使用、proto3 はそのまま）
			field := tplInputField{
				GoName:    goName,
				JsonName:  jsonName,
				ParamName: lowerFirst(reqField.GoName),
				GoType:    goTypeFromKind(reqField),
			}
			method.InputFields = append(method.InputFields, field)
			if _, isPath := pathParamSet[jsonName]; isPath {
				method.PathParamFields = append(method.PathParamFields, field)
			} else {
				method.BodyFields = append(method.BodyFields, field)
			}
		}
		method.HasInputFields = len(method.InputFields) > 0
		method.HasPathParams = len(method.PathParamFields) > 0
		method.HasBodyFields = len(method.BodyFields) > 0

		// Response の形状を調べ、単一 entity / repeated entity / その他を判定
		if len(output.Fields) == 1 {
			resField := output.Fields[0]
			if resField.Message != nil {
				if ent, ok := entities[resField.Message.Desc.FullName()]; ok {
					method.EntityGoName = ent.Name
					method.EntityLowerFirst = lowerFirst(ent.Name)
					if resField.Desc.IsList() {
						method.ReturnsList = true
					} else {
						method.ReturnsEntity = true
					}
					// pb 変換で使う entity を登録
					if _, seen := entityRefByName[ent.Name]; !seen {
						ref := tplEntityRef{
							Name:       ent.Name,
							LowerFirst: lowerFirst(ent.Name),
							SnakeName:  ent.SnakeName,
						}
						for _, f := range ent.Fields {
							ref.Fields = append(ref.Fields, toTplField(f))
						}
						entityRefByName[ent.Name] = ref
					}
				}
			}
		}
		if !method.ReturnsEntity && !method.ReturnsList {
			method.ReturnsEmpty = true
		}
		if method.ReturnsEntity || method.ReturnsList {
			s.AnyReturnsEntity = true
		}

		s.Methods = append(s.Methods, method)
	}

	for _, ref := range entityRefByName {
		s.UsedEntities = append(s.UsedEntities, ref)
	}
	sort.Slice(s.UsedEntities, func(i, j int) bool {
		return s.UsedEntities[i].Name < s.UsedEntities[j].Name
	})

	return s
}

// @http METHOD /path を leading comment から抽出。
func parseHttpAnnotation(comment string) *tplHttp {
	for _, line := range strings.Split(comment, "\n") {
		line = strings.TrimSpace(line)
		line = strings.TrimPrefix(line, "//")
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "@http ") {
			continue
		}
		rest := strings.TrimSpace(strings.TrimPrefix(line, "@http "))
		parts := strings.Fields(rest)
		if len(parts) != 2 {
			continue
		}
		method := strings.ToUpper(parts[0])
		switch method {
		case "GET", "POST", "PUT", "PATCH", "DELETE":
			return &tplHttp{Method: method, Path: parts[1]}
		}
	}
	return nil
}

func extractPathParams(path string) []string {
	var out []string
	for {
		start := strings.Index(path, "{")
		if start == -1 {
			break
		}
		end := strings.Index(path[start:], "}")
		if end == -1 {
			break
		}
		out = append(out, path[start+1:start+end])
		path = path[start+end+1:]
	}
	return out
}

func goTypeFromKind(f *protogen.Field) string {
	switch f.Desc.Kind() {
	case protoreflect.StringKind:
		return "string"
	case protoreflect.BoolKind:
		return "bool"
	case protoreflect.Int32Kind, protoreflect.Sint32Kind, protoreflect.Sfixed32Kind:
		return "int32"
	case protoreflect.Int64Kind, protoreflect.Sint64Kind, protoreflect.Sfixed64Kind:
		return "int64"
	case protoreflect.Uint32Kind, protoreflect.Fixed32Kind:
		return "uint32"
	case protoreflect.Uint64Kind, protoreflect.Fixed64Kind:
		return "uint64"
	case protoreflect.FloatKind:
		return "float32"
	case protoreflect.DoubleKind:
		return "float64"
	case protoreflect.BytesKind:
		return "[]byte"
	default:
		return "string"
	}
}

// ==================== tpl data for entity kinds ====================

func toTplData(e *entitySpec) tplData {
	lower := lowerFirst(e.Name)
	data := tplData{
		Name:             e.Name,
		SnakeName:        e.SnakeName,
		LowerFirst:       lower,
		Plural:           lower + "s",
		Receiver:         strings.ToLower(string(e.Name[0])),
		ImportEntity:     goImportEntity,
		ImportRepository: goImportRepository,
		ImportMock:       goImportMock,
		ImportInfraRepo:  goImportInfraRepo,
	}
	for _, f := range e.Fields {
		tf := toTplField(f)
		data.Fields = append(data.Fields, tf)
	}
	data.PKField = toTplField(*e.PKField)
	for _, u := range e.UniqueFields {
		if u.IsPK {
			continue
		}
		data.UniqueFieldsNonPK = append(data.UniqueFieldsNonPK, toTplField(u))
	}
	return data
}

func toTplField(f fieldSpec) tplField {
	return tplField{
		GoName:      f.GoName,
		ParamName:   f.ParamName,
		SnakeName:   f.SnakeName,
		ProtoType:   f.ProtoType,
		GoType:      f.GoType,
		PbFieldGo:   f.PbFieldGo,
		IsPK:        f.IsPK,
		IsUnique:    f.IsUnique,
		IsEmail:     f.IsEmail,
		IsRequired:  f.IsRequired,
		IsTimestamp: f.IsTimestamp,
	}
}

// ==================== template funcs ====================

func goTestValue(f tplField, suffixExpr string) string {
	if f.IsTimestamp {
		return "time.Unix(0, 0)"
	}
	switch f.GoType {
	case "string":
		prefix := f.SnakeName
		if f.IsEmail {
			return fmt.Sprintf("%q + %s + %q", prefix+"-", suffixExpr, "@example.com")
		}
		return fmt.Sprintf("%q + %s", prefix+"-", suffixExpr)
	case "int32":
		return "int32(1)"
	case "int64":
		return "int64(1)"
	case "bool":
		return "false"
	default:
		return `""`
	}
}

func gormTag(f tplField) string {
	tags := []string{"column:" + f.SnakeName}
	if f.IsPK {
		tags = append(tags, "primaryKey")
	}
	if f.IsUnique && !f.IsPK {
		tags = append(tags, "uniqueIndex")
	}
	if !f.IsPK {
		tags = append(tags, "not null")
	}
	return strings.Join(tags, ";")
}

// ==================== helpers ====================

func hasMarker(comment, marker string) bool {
	for _, line := range strings.Split(comment, "\n") {
		line = strings.TrimSpace(line)
		line = strings.TrimPrefix(line, "//")
		for _, tok := range strings.Fields(line) {
			if tok == marker {
				return true
			}
		}
	}
	return false
}

func normalizeInitialisms(s string) string {
	repl := map[string]string{
		"Id":   "ID",
		"Url":  "URL",
		"Api":  "API",
		"Http": "HTTP",
		"Json": "JSON",
		"Xml":  "XML",
	}
	for from, to := range repl {
		if s == from {
			return to
		}
		if strings.HasSuffix(s, from) && len(s) > len(from) {
			prev := s[len(s)-len(from)-1]
			if prev >= 'a' && prev <= 'z' {
				s = s[:len(s)-len(from)] + to
			}
		}
	}
	return s
}

func lowerFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToLower(string(s[0])) + s[1:]
}

func toSnake(s string) string {
	var b strings.Builder
	for i, r := range s {
		if i > 0 && r >= 'A' && r <= 'Z' {
			b.WriteByte('_')
		}
		if r >= 'A' && r <= 'Z' {
			b.WriteRune(r + 32)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}
