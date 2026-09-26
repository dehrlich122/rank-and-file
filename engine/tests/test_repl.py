from rankfile.repl import Repl


def test_expressions_show_their_value():
    repl = Repl()
    assert repl.push("2 + 3") == {"more": False, "output": "5\n", "error": None}
    assert repl.push("'hi'")["output"] == "'hi'\n"


def test_variables_are_remembered():
    repl = Repl()
    repl.push("gold = 10")
    assert repl.push("gold * 2")["output"] == "20\n"


def test_blocks_wait_for_a_blank_line():
    repl = Repl()
    assert repl.push("for i in range(2):")["more"] is True
    assert repl.push("    print(i)")["more"] is True
    assert repl.push("") == {"more": False, "output": "0\n1\n", "error": None}


def test_errors_are_explained_and_the_session_continues():
    repl = Repl()
    repl.push("gold = 1")
    result = repl.push("print(glod)")
    assert result["error"]["friendly"] == "Python doesn't know the name `glod`. Did you mean `gold`?"
    assert repl.push("gold")["output"] == "1\n"


def test_syntax_errors_clear_the_pending_input():
    repl = Repl()
    result = repl.push("x = = 2")
    assert result["error"]["type"] == "SyntaxError"
    assert repl.push("3")["output"] == "3\n"


def test_endless_loops_are_stopped():
    result = Repl().push("while True: pass")
    assert result["more"] is True  # a block: waits for the blank line, like the real prompt
    repl = Repl()
    repl.push("while True: pass")
    assert "never finished" in repl.push("")["error"]["friendly"]


def test_reset_forgets_everything():
    repl = Repl()
    repl.push("gold = 1")
    repl.reset()
    assert repl.push("gold")["error"]["type"] == "NameError"
